import Web3 from "web3";
import { toWei } from "web3-utils";
import { encodeSyncFunction, SyncArgs } from "../src/signatures";
import { deploySFLContracts, gasLimit, TestAccount } from "./test-support";

describe("Session contract", () => {
  function increaseTime(web3: any, seconds: number) {
    const id = Date.now();
    return new Promise((resolve, reject) => {
      web3.currentProvider.send(
        {
          jsonrpc: "2.0",
          method: "evm_increaseTime",
          params: [seconds],
          id: id,
        },
        (err1: any) => {
          if (err1) return reject(err1);

          web3.currentProvider.send(
            {
              jsonrpc: "2.0",
              method: "evm_mine",
              id: id + 1,
            },
            (err2: any, res: any) => {
              return err2 ? reject(err2) : resolve(res);
            }
          );
        }
      );
    });
  }
  describe("sync", () => {
    const validDeadline = 10000000000000;
    const fee = toWei("0.1");

    it("requires the transaction is submitted before the deadline", async () => {
      const web3 = new Web3(
        new Web3.providers.HttpProvider(process.env.ETH_NETWORK?process.env.ETH_NETWORK:"")
      );
      const { session } = await deploySFLContracts(web3);

      const sessionId = web3.utils.keccak256("0");

      // 10 seconds to late :(
      const deadline = Math.floor(Date.now() / 1000 - 10);

      const signature = await sign(web3, {
        sessionId,
        deadline,
        sender: TestAccount.PLAYER.address,
        farmId: 1,
        mintIds: [],
        mintAmounts: [],
        burnIds: [],
        burnAmounts: [],
        tokens: 10,
      });

      const result = session.methods
        .sync(signature, sessionId, deadline, 1, [], [], [], [], -10)
        .send({
          from: TestAccount.PLAYER.address,
          gasPrice: await web3.eth.getGasPrice(),
          gas: gasLimit,
          value: fee,
        });

      await expect(
        result.catch((e: Error) => Promise.reject(e.message))
      ).rejects.toContain("SunflowerLand: Deadline Passed");
    });

    it("requires the session ID matches", async () => {
      const web3 = new Web3(
        new Web3.providers.HttpProvider(process.env.ETH_NETWORK?process.env.ETH_NETWORK:"")
      );
      const { session } = await deploySFLContracts(web3);

      const sessionId = web3.utils.keccak256("randomID");

      const signature = await sign(web3, {
        sessionId,
        deadline: validDeadline,
        sender: TestAccount.PLAYER.address,
        farmId: 1,
        mintIds: [],
        mintAmounts: [],
        burnIds: [],
        burnAmounts: [],
        tokens: 10,
      });

      const result = session.methods
        .sync(signature, sessionId, validDeadline, 1, [], [], [], [], 10)
        .send({
          from: TestAccount.PLAYER.address,
          gasPrice: await web3.eth.getGasPrice(),
          gas: gasLimit,
          value: fee,
        });

      await expect(
        result.catch((e: Error) => Promise.reject(e.message))
      ).rejects.toContain("SunflowerLand: Session has changed");
    });

    it("requires the sender owns the farm", async () => {
      const web3 = new Web3(
        new Web3.providers.HttpProvider(process.env.ETH_NETWORK?process.env.ETH_NETWORK:"")
      );
      const { session, farm } = await deploySFLContracts(web3);

      // Mint it to the team address (not the player)
      await farm.methods.mint(TestAccount.TEAM.address).send({
        from: TestAccount.TEAM.address,
        gasPrice: await web3.eth.getGasPrice(),
        gas: gasLimit,
      });

      const sessionId = await session.methods
        .getSessionId(1)
        .call({ from: TestAccount.PLAYER.address });

      const signature = await sign(web3, {
        sessionId,
        deadline: validDeadline,
        sender: TestAccount.PLAYER.address,
        farmId: 1,
        mintIds: [],
        mintAmounts: [],
        burnIds: [],
        burnAmounts: [],
        tokens: 10,
      });

      const result = session.methods
        .sync(signature, sessionId, validDeadline, 1, [], [], [], [], 10)
        .send({
          from: TestAccount.PLAYER.address,
          gasPrice: await web3.eth.getGasPrice(),
          gas: gasLimit,
          value: fee,
        });

      await expect(
        result.catch((e: Error) => Promise.reject(e.message))
      ).rejects.toContain("SunflowerLand: You do not own this farm");
    });

    it("mints items for a farm", async () => {
      const web3 = new Web3(
        new Web3.providers.HttpProvider(process.env.ETH_NETWORK?process.env.ETH_NETWORK:"")
      );
      const { session, farm, inventory, token } = await deploySFLContracts(
        web3
      );

      await farm.methods.mint(TestAccount.PLAYER.address).send({
        from: TestAccount.TEAM.address,
        gasPrice: await web3.eth.getGasPrice(),
        gas: gasLimit,
      });

      const farmNFT = await farm.methods
        .getFarm(1)
        .call({ from: TestAccount.PLAYER.address });

      let tokenBalance = await token.methods
        .balanceOf(farmNFT.account)
        .call({ from: TestAccount.PLAYER.address });

      expect(tokenBalance).toEqual("0");

      let inventoryBalance = await inventory.methods
        .balanceOf(farmNFT.account, 1)
        .call({ from: TestAccount.PLAYER.address });

      expect(inventoryBalance).toEqual("0");

      const sessionId = await session.methods
        .getSessionId(1)
        .call({ from: TestAccount.PLAYER.address });

      const signature = await sign(web3, {
        sessionId,
        deadline: validDeadline,
        sender: TestAccount.PLAYER.address,
        farmId: 1,
        mintIds: [1],
        mintAmounts: [toWei("500")],
        burnIds: [],
        burnAmounts: [],
        tokens: toWei("60"),
      });

      await session.methods
        .sync(
          signature,
          sessionId,
          validDeadline,
          1,
          [1],
          [toWei("500")],
          [],
          [],
          toWei("60")
        )
        .send({
          from: TestAccount.PLAYER.address,
          gasPrice: await web3.eth.getGasPrice(),
          gas: gasLimit,
          value: fee,
        });

      tokenBalance = await token.methods
        .balanceOf(farmNFT.account)
        .call({ from: TestAccount.PLAYER.address });

      expect(tokenBalance).toEqual(toWei("60"));

      inventoryBalance = await inventory.methods
        .balanceOf(farmNFT.account, 1)
        .call({ from: TestAccount.PLAYER.address });

      expect(inventoryBalance).toEqual(toWei("500"));
    });

    it("requires the mint IDs are in the signature", async () => {
      const web3 = new Web3(
        new Web3.providers.HttpProvider(process.env.ETH_NETWORK?process.env.ETH_NETWORK:"")
      );
      const { session, farm } = await deploySFLContracts(web3);

      // Mint it to the team address (not the player)
      await farm.methods.mint(TestAccount.TEAM.address).send({
        from: TestAccount.TEAM.address,
        gasPrice: await web3.eth.getGasPrice(),
        gas: gasLimit,
      });

      const sessionId = await session.methods
        .getSessionId(1)
        .call({ from: TestAccount.PLAYER.address });

      const signature = await sign(web3, {
        sessionId,
        deadline: validDeadline,
        sender: TestAccount.PLAYER.address,
        farmId: 1,
        mintIds: [],
        mintAmounts: [],
        burnIds: [],
        burnAmounts: [],
        // Only 10 tokens
        tokens: 10,
      });

      const result = session.methods
        .sync(
          signature,
          sessionId,
          validDeadline,
          1,
          [],
          [],
          [],
          [],
          // Something dodgy!
          65000000000000
        )
        .send({
          from: TestAccount.PLAYER.address,
          gasPrice: await web3.eth.getGasPrice(),
          gas: gasLimit,
          value: fee,
        });

      await expect(
        result.catch((e: Error) => Promise.reject(e.message))
      ).rejects.toContain("SunflowerLand: Unauthorised");
    });

    it("burns items for a farm", async () => {
      const web3 = new Web3(
        new Web3.providers.HttpProvider(process.env.ETH_NETWORK?process.env.ETH_NETWORK:"")
      );
      const { session, farm, inventory, token } = await deploySFLContracts(
        web3
      );

      await farm.methods.mint(TestAccount.PLAYER.address).send({
        from: TestAccount.TEAM.address,
        gasPrice: await web3.eth.getGasPrice(),
        gas: gasLimit,
      });

      const farmNFT = await farm.methods
        .getFarm(1)
        .call({ from: TestAccount.PLAYER.address });

      // Mint some items
      await token.methods.gameMint(farmNFT.account, 200).send({
        from: TestAccount.TEAM.address,
        gasPrice: await web3.eth.getGasPrice(),
        gas: gasLimit,
      });

      await inventory.methods
        .gameMint(farmNFT.account, [1], [500], web3.utils.keccak256("randomID"))
        .send({
          from: TestAccount.TEAM.address,
          gasPrice: await web3.eth.getGasPrice(),
          gas: gasLimit,
        });

      const sessionId = await session.methods
        .getSessionId(1)
        .call({ from: TestAccount.PLAYER.address });

      const signature = await sign(web3, {
        sessionId,
        deadline: validDeadline,
        sender: TestAccount.PLAYER.address,
        farmId: 1,
        mintIds: [],
        mintAmounts: [],
        burnIds: [1],
        burnAmounts: [300],
        tokens: -50,
      });

      await session.methods
        .sync(signature, sessionId, validDeadline, 1, [], [], [1], [300], -50)
        .send({
          from: TestAccount.PLAYER.address,
          gasPrice: await web3.eth.getGasPrice(),
          gas: gasLimit,
          value: fee,
        });

      const tokenBalance = await token.methods
        .balanceOf(farmNFT.account)
        .call({ from: TestAccount.PLAYER.address });

      expect(tokenBalance).toEqual("150");

      const inventoryBalance = await inventory.methods
        .balanceOf(farmNFT.account, 1)
        .call({ from: TestAccount.PLAYER.address });

      expect(inventoryBalance).toEqual("200");
    });

    it("requires the burn IDs are in the signature", async () => {
      const web3 = new Web3(
        new Web3.providers.HttpProvider(process.env.ETH_NETWORK?process.env.ETH_NETWORK:"")
      );
      const { session, farm } = await deploySFLContracts(web3);

      // Mint it to the team address (not the player)
      await farm.methods.mint(TestAccount.TEAM.address).send({
        from: TestAccount.TEAM.address,
        gasPrice: await web3.eth.getGasPrice(),
        gas: gasLimit,
      });

      const sessionId = await session.methods
        .getSessionId(1)
        .call({ from: TestAccount.PLAYER.address });

      const signature = await sign(web3, {
        sessionId,
        deadline: validDeadline,
        sender: TestAccount.PLAYER.address,
        farmId: 1,
        mintIds: [],
        mintAmounts: [],
        burnIds: [1],
        burnAmounts: [20000000],
        tokens: 0,
      });

      const result = session.methods
        .sync(
          signature,
          sessionId,
          validDeadline,
          1,
          [],
          [],
          [1],
          // Something dodgy!
          [5],
          0
        )
        .send({
          from: TestAccount.PLAYER.address,
          gasPrice: await web3.eth.getGasPrice(),
          gas: gasLimit,
          value: fee,
        });

      await expect(
        result.catch((e: Error) => Promise.reject(e.message))
      ).rejects.toContain("SunflowerLand: Unauthorised");
    });

    it("requires a new the session ID", async () => {
      const web3 = new Web3(
        new Web3.providers.HttpProvider(process.env.ETH_NETWORK?process.env.ETH_NETWORK:"")
      );
      const { session, farm, inventory, token } = await deploySFLContracts(
        web3
      );

      await farm.methods.mint(TestAccount.PLAYER.address).send({
        from: TestAccount.TEAM.address,
        gasPrice: await web3.eth.getGasPrice(),
        gas: gasLimit,
      });

      const farmNFT = await farm.methods
        .getFarm(1)
        .call({ from: TestAccount.PLAYER.address });

      const sessionId = await session.methods
        .getSessionId(1)
        .call({ from: TestAccount.PLAYER.address });

      const signature = await sign(web3, {
        sessionId,
        deadline: validDeadline,
        sender: TestAccount.PLAYER.address,
        farmId: 1,
        mintIds: [1],
        mintAmounts: [500],
        burnIds: [],
        burnAmounts: [],
        tokens: 60,
      });

      await session.methods
        .sync(signature, sessionId, validDeadline, 1, [1], [500], [], [], 60)
        .send({
          from: TestAccount.PLAYER.address,
          gasPrice: await web3.eth.getGasPrice(),
          gas: gasLimit,
          value: fee,
        });

      // Avoid throttled method
      await increaseTime(web3, 60 + 1);

      // Try again with same session ID
      const result = session.methods
        .sync(signature, sessionId, validDeadline, 1, [1], [200], [], [], 99)
        .send({
          from: TestAccount.PLAYER.address,
          gasPrice: await web3.eth.getGasPrice(),
          gas: gasLimit,
          value: fee,
        });

      await expect(
        result.catch((e: Error) => Promise.reject(e.message))
      ).rejects.toContain("SunflowerLand: Session has changed");

      const newSessionId = await session.methods
        .getSessionId(1)
        .call({ from: TestAccount.PLAYER.address });

      const newSignature = await sign(web3, {
        sessionId: newSessionId,
        deadline: validDeadline,
        sender: TestAccount.PLAYER.address,
        farmId: 1,
        mintIds: [1],
        mintAmounts: [500],
        burnIds: [],
        burnAmounts: [],
        tokens: 60,
      });

      await session.methods
        .sync(
          newSignature,
          newSessionId,
          validDeadline,
          1,
          [1],
          [500],
          [],
          [],
          60
        )
        .send({
          from: TestAccount.PLAYER.address,
          gasPrice: await web3.eth.getGasPrice(),
          gas: gasLimit,
          value: fee,
        });

      const tokenBalance = await token.methods
        .balanceOf(farmNFT.account)
        .call({ from: TestAccount.PLAYER.address });

      expect(tokenBalance).toEqual("120");
    });

    it("requires a sufficient fee", async () => {
      const web3 = new Web3(
        new Web3.providers.HttpProvider(process.env.ETH_NETWORK?process.env.ETH_NETWORK:"")
      );
      const { session, farm } = await deploySFLContracts(web3);

      await farm.methods.mint(TestAccount.PLAYER.address).send({
        from: TestAccount.TEAM.address,
        gasPrice: await web3.eth.getGasPrice(),
        gas: gasLimit,
      });

      // Used to check the fee works
      const teamBalance = await web3.eth.getBalance(TestAccount.TEAM.address);

      const sessionId = await session.methods
        .getSessionId(1)
        .call({ from: TestAccount.PLAYER.address });

      const signature = await sign(web3, {
        sessionId,
        deadline: validDeadline,
        sender: TestAccount.PLAYER.address,
        farmId: 1,
        mintIds: [1],
        mintAmounts: [500],
        burnIds: [],
        burnAmounts: [],
        tokens: 60,
      });

      const result = session.methods
        .sync(signature, sessionId, validDeadline, 1, [1], [500], [], [], 60)
        .send({
          from: TestAccount.PLAYER.address,
          gasPrice: await web3.eth.getGasPrice(),
          gas: gasLimit,
          value: toWei("0.09"),
        });

      await expect(
        result.catch((e: Error) => Promise.reject(e.message))
      ).rejects.toContain("SunflowerLand: Missing fee");
    });

    it("takes the fee", async () => {
      const web3 = new Web3(
        new Web3.providers.HttpProvider(process.env.ETH_NETWORK?process.env.ETH_NETWORK:"")
      );
      const { session, farm } = await deploySFLContracts(web3);

      await farm.methods.mint(TestAccount.PLAYER.address).send({
        from: TestAccount.TEAM.address,
        gasPrice: await web3.eth.getGasPrice(),
        gas: gasLimit,
      });

      const sessionId = await session.methods
        .getSessionId(1)
        .call({ from: TestAccount.PLAYER.address });

      const signature = await sign(web3, {
        sessionId,
        deadline: validDeadline,
        sender: TestAccount.PLAYER.address,
        farmId: 1,
        mintIds: [1],
        mintAmounts: [500],
        burnIds: [],
        burnAmounts: [],
        tokens: 60,
      });

      // Used to check the fee works
      const teamBalance = await web3.eth.getBalance(TestAccount.TEAM.address);

      await session.methods
        .sync(signature, sessionId, validDeadline, 1, [1], [500], [], [], 60)
        .send({
          from: TestAccount.PLAYER.address,
          gasPrice: await web3.eth.getGasPrice(),
          gas: gasLimit,
          value: fee,
        });

      // Expect the fee to be taken
      const newTeamBalance = await web3.eth.getBalance(
        TestAccount.TEAM.address
      );

      expect(Number(newTeamBalance)).toEqual(Number(teamBalance) + Number(fee));
    });

    it("throttles the sync method", async () => {
      const web3 = new Web3(
        new Web3.providers.HttpProvider(process.env.ETH_NETWORK?process.env.ETH_NETWORK:"")
      );
      const { session, farm } = await deploySFLContracts(web3);

      await farm.methods.mint(TestAccount.PLAYER.address).send({
        from: TestAccount.TEAM.address,
        gasPrice: await web3.eth.getGasPrice(),
        gas: gasLimit,
      });

      const sessionId = await session.methods
        .getSessionId(1)
        .call({ from: TestAccount.PLAYER.address });

      const signature = await sign(web3, {
        sessionId,
        deadline: validDeadline,
        sender: TestAccount.PLAYER.address,
        farmId: 1,
        mintIds: [],
        mintAmounts: [],
        burnIds: [],
        burnAmounts: [],
        tokens: 0,
      });

      await session.methods
        .sync(signature, sessionId, validDeadline, 1, [], [], [], [], 0)
        .send({
          from: TestAccount.PLAYER.address,
          gasPrice: await web3.eth.getGasPrice(),
          gas: gasLimit,
          value: fee,
        });

      const result = session.methods
        .sync(signature, sessionId, validDeadline, 1, [], [], [], [], 0)
        .send({
          from: TestAccount.PLAYER.address,
          gasPrice: await web3.eth.getGasPrice(),
          gas: gasLimit,
          value: fee,
        });

      await expect(
        result.catch((e: Error) => Promise.reject(e.message))
      ).rejects.toContain("SunflowerLand: Too many requests");
    });

    async function sign(web3: Web3, args: SyncArgs) {
      const sha = encodeSyncFunction({
        ...args,
      });
      const { signature } = await web3.eth.accounts.sign(
        sha,
        TestAccount.TEAM.privateKey
      );

      return signature;
    }
  });

  describe("withdraw", () => {
    const validDeadline = 10000000000000;

    it("requires the transaction is submitted before the deadline", async () => {
      const web3 = new Web3(
        new Web3.providers.HttpProvider(process.env.ETH_NETWORK?process.env.ETH_NETWORK:"")
      );
      const { session } = await deploySFLContracts(web3);

      const sessionId = web3.utils.keccak256("0");

      // 10 seconds to late :(
      const deadline = Math.floor(Date.now() / 1000 - 10);

      const signature = await sign(web3, {
        sessionId,
        deadline,
        sender: TestAccount.PLAYER.address,
        farmId: 1,
        ids: [],
        amounts: [],
        sfl: 10,
        tax: 50,
      });

      const result = session.methods
        .withdraw(signature, sessionId, deadline, 1, [], [], 10, 50)
        .send({
          from: TestAccount.PLAYER.address,
          gasPrice: await web3.eth.getGasPrice(),
          gas: gasLimit,
        });

      await expect(
        result.catch((e: Error) => Promise.reject(e.message))
      ).rejects.toContain("SunflowerLand: Deadline Passed");
    });

    it("requires the session ID matches", async () => {
      const web3 = new Web3(
        new Web3.providers.HttpProvider(process.env.ETH_NETWORK?process.env.ETH_NETWORK:"")
      );
      const { session } = await deploySFLContracts(web3);

      const sessionId = web3.utils.keccak256("randomID");

      const signature = await sign(web3, {
        sessionId,
        deadline: validDeadline,
        sender: TestAccount.PLAYER.address,
        farmId: 1,
        ids: [],
        amounts: [],
        sfl: 10,
        tax: 50,
      });

      const result = session.methods
        .withdraw(signature, sessionId, validDeadline, 1, [], [], 10, 50)
        .send({
          from: TestAccount.PLAYER.address,
          gasPrice: await web3.eth.getGasPrice(),
          gas: gasLimit,
        });

      await expect(
        result.catch((e: Error) => Promise.reject(e.message))
      ).rejects.toContain("SunflowerLand: Session has changed");
    });

    it("requires the sender owns the farm", async () => {
      const web3 = new Web3(
        new Web3.providers.HttpProvider(process.env.ETH_NETWORK?process.env.ETH_NETWORK:"")
      );
      const { session, farm } = await deploySFLContracts(web3);

      // Mint it to the team address (not the player)
      await farm.methods.mint(TestAccount.TEAM.address).send({
        from: TestAccount.TEAM.address,
        gasPrice: await web3.eth.getGasPrice(),
        gas: gasLimit,
      });

      const sessionId = await session.methods
        .getSessionId(1)
        .call({ from: TestAccount.PLAYER.address });

      const signature = await sign(web3, {
        sessionId,
        deadline: validDeadline,
        sender: TestAccount.PLAYER.address,
        farmId: 1,
        ids: [],
        amounts: [],
        sfl: 10,
        tax: 50,
      });

      const result = session.methods
        .withdraw(signature, sessionId, validDeadline, 1, [], [], 10, 50)
        .send({
          from: TestAccount.PLAYER.address,
          gasPrice: await web3.eth.getGasPrice(),
          gas: gasLimit,
        });

      await expect(
        result.catch((e: Error) => Promise.reject(e.message))
      ).rejects.toContain("SunflowerLand: You do not own this farm");
    });

    it("withdraws items for a farm", async () => {
      const web3 = new Web3(
        new Web3.providers.HttpProvider(process.env.ETH_NETWORK?process.env.ETH_NETWORK:"")
      );
      const { session, farm, inventory, token } = await deploySFLContracts(
        web3
      );

      await farm.methods.mint(TestAccount.PLAYER.address).send({
        from: TestAccount.TEAM.address,
        gasPrice: await web3.eth.getGasPrice(),
        gas: gasLimit,
      });

      const farmNFT = await farm.methods
        .getFarm(1)
        .call({ from: TestAccount.PLAYER.address });

      // Mint some items to the farm address
      await token.methods.gameMint(farmNFT.account, 100).send({
        from: TestAccount.TEAM.address,
        gasPrice: await web3.eth.getGasPrice(),
        gas: gasLimit,
      });

      await inventory.methods
        .gameMint(farmNFT.account, [1], [700], web3.utils.keccak256("randomID"))
        .send({
          from: TestAccount.TEAM.address,
          gasPrice: await web3.eth.getGasPrice(),
          gas: gasLimit,
        });

      const sessionId = await session.methods
        .getSessionId(1)
        .call({ from: TestAccount.PLAYER.address });

      const tax = 50;
      const sfl = 60;
      const signature = await sign(web3, {
        sessionId,
        deadline: validDeadline,
        sender: TestAccount.PLAYER.address,
        farmId: 1,
        ids: [1],
        amounts: [500],
        sfl,
        tax,
      });

      await session.methods
        .withdraw(signature, sessionId, validDeadline, 1, [1], [500], sfl, tax)
        .send({
          from: TestAccount.PLAYER.address,
          gasPrice: await web3.eth.getGasPrice(),
          gas: gasLimit,
        });

      // Farm tokens are subtracted
      const farmTokens = await token.methods
        .balanceOf(farmNFT.account)
        .call({ from: TestAccount.PLAYER.address });
      expect(farmTokens).toEqual("40");

      // Farm inventory is subtracted
      const farmInventory = await inventory.methods
        .balanceOf(farmNFT.account, 1)
        .call({ from: TestAccount.PLAYER.address });
      expect(farmInventory).toEqual("200");

      // Expect player to only have the taxed amount
      const amount = sfl * (1 - tax / 1000);

      // Player tokens are increased
      const playerTokens = await token.methods
        .balanceOf(TestAccount.PLAYER.address)
        .call({ from: TestAccount.PLAYER.address });
      expect(playerTokens).toEqual(amount.toString());

      // Player inventory is increased
      const playerInventory = await inventory.methods
        .balanceOf(TestAccount.PLAYER.address, [1])
        .call({ from: TestAccount.PLAYER.address });
      expect(playerInventory).toEqual("500");
    });

    it("requires the tax is in the signature", async () => {
      const web3 = new Web3(
        new Web3.providers.HttpProvider(process.env.ETH_NETWORK?process.env.ETH_NETWORK:"")
      );
      const { session, farm } = await deploySFLContracts(web3);

      // Mint it to the team address (not the player)
      await farm.methods.mint(TestAccount.TEAM.address).send({
        from: TestAccount.TEAM.address,
        gasPrice: await web3.eth.getGasPrice(),
        gas: gasLimit,
      });

      const sessionId = await session.methods
        .getSessionId(1)
        .call({ from: TestAccount.PLAYER.address });

      const signature = await sign(web3, {
        sessionId,
        deadline: validDeadline,
        sender: TestAccount.PLAYER.address,
        farmId: 1,
        ids: [],
        amounts: [],
        sfl: 10,
        tax: 10,
      });

      const result = session.methods
        .withdraw(signature, sessionId, validDeadline, 1, [], [], 10, 0)
        .send({
          from: TestAccount.PLAYER.address,
          gasPrice: await web3.eth.getGasPrice(),
          gas: gasLimit,
        });

      await expect(
        result.catch((e: Error) => Promise.reject(e.message))
      ).rejects.toContain("SunflowerLand: Unauthorised");
    });

    it("requires a new the session ID", async () => {
      const web3 = new Web3(
        new Web3.providers.HttpProvider(process.env.ETH_NETWORK?process.env.ETH_NETWORK:"")
      );
      const { session, farm, inventory, token } = await deploySFLContracts(
        web3
      );

      await farm.methods.mint(TestAccount.PLAYER.address).send({
        from: TestAccount.TEAM.address,
        gasPrice: await web3.eth.getGasPrice(),
        gas: gasLimit,
      });

      const farmNFT = await farm.methods
        .getFarm(1)
        .call({ from: TestAccount.PLAYER.address });

      await token.methods.gameMint(farmNFT.account, 10000).send({
        from: TestAccount.TEAM.address,
        gasPrice: await web3.eth.getGasPrice(),
        gas: gasLimit,
      });

      const sessionId = await session.methods
        .getSessionId(1)
        .call({ from: TestAccount.PLAYER.address });

      const signature = await sign(web3, {
        sessionId,
        deadline: validDeadline,
        sender: TestAccount.PLAYER.address,
        farmId: 1,
        ids: [],
        amounts: [],
        sfl: 60,
        tax: 50,
      });

      await session.methods
        .withdraw(signature, sessionId, validDeadline, 1, [], [], 60, 50)
        .send({
          from: TestAccount.PLAYER.address,
          gasPrice: await web3.eth.getGasPrice(),
          gas: gasLimit,
        });

      // Avoid throttled method
      await increaseTime(web3, 60 + 1);

      // Try again with same session ID
      const result = session.methods
        .withdraw(signature, sessionId, validDeadline, 1, [], [], 60, 50)
        .send({
          from: TestAccount.PLAYER.address,
          gasPrice: await web3.eth.getGasPrice(),
          gas: gasLimit,
        });

      await expect(
        result.catch((e: Error) => Promise.reject(e.message))
      ).rejects.toContain("SunflowerLand: Session has changed");

      const newSessionId = await session.methods
        .getSessionId(1)
        .call({ from: TestAccount.PLAYER.address });

      const newSignature = await sign(web3, {
        sessionId: newSessionId,
        deadline: validDeadline,
        sender: TestAccount.PLAYER.address,
        farmId: 1,
        ids: [],
        amounts: [],
        sfl: 60,
        tax: 50,
      });

      await session.methods
        .withdraw(newSignature, newSessionId, validDeadline, 1, [], [], 60, 50)
        .send({
          from: TestAccount.PLAYER.address,
          gasPrice: await web3.eth.getGasPrice(),
          gas: gasLimit,
        });

      const tokenBalance = await token.methods
        .balanceOf(farmNFT.account)
        .call({ from: TestAccount.PLAYER.address });

      expect(tokenBalance).toEqual("9880");
    });

    it("takes the SFL tax", async () => {
      const web3 = new Web3(
        new Web3.providers.HttpProvider(process.env.ETH_NETWORK?process.env.ETH_NETWORK:"")
      );
      const { session, farm, token, wishingWell } = await deploySFLContracts(
        web3
      );

      await farm.methods.mint(TestAccount.PLAYER.address).send({
        from: TestAccount.TEAM.address,
        gasPrice: await web3.eth.getGasPrice(),
        gas: gasLimit,
      });

      const farmNFT = await farm.methods
        .getFarm(1)
        .call({ from: TestAccount.PLAYER.address });

      const sfl = 600000;

      // Mint some items
      await token.methods.gameMint(farmNFT.account, sfl).send({
        from: TestAccount.TEAM.address,
        gasPrice: await web3.eth.getGasPrice(),
        gas: gasLimit,
      });

      const sessionId = await session.methods
        .getSessionId(1)
        .call({ from: TestAccount.PLAYER.address });

      const tax = 50;
      const signature = await sign(web3, {
        sessionId,
        deadline: validDeadline,
        sender: TestAccount.PLAYER.address,
        farmId: 1,
        ids: [],
        amounts: [],
        sfl,
        tax,
      });

      await session.methods
        .withdraw(signature, sessionId, validDeadline, 1, [], [], sfl, tax)
        .send({
          from: TestAccount.PLAYER.address,
          gasPrice: await web3.eth.getGasPrice(),
          gas: gasLimit,
        });

      // Expect player to only have the taxed amount
      const totalTax = sfl * (tax / 1000);
      const teamAmount = totalTax * 0.7;
      const wishingWellAmount = totalTax * 0.3;

      const teamBalance = await token.methods
        .balanceOf(TestAccount.TEAM.address)
        .call({ from: TestAccount.PLAYER.address });

      expect(teamBalance).toEqual(teamAmount.toString());

      const wishingWellBalance = await token.methods
        .balanceOf(wishingWell.options.address)
        .call({ from: TestAccount.PLAYER.address });

      expect(wishingWellBalance).toEqual(wishingWellAmount.toString());
    });

    it("withdraws multiple times", async () => {
      const web3 = new Web3(
        new Web3.providers.HttpProvider(process.env.ETH_NETWORK?process.env.ETH_NETWORK:"")
      );
      const { session, farm, token, wishingWell } = await deploySFLContracts(
        web3
      );

      await farm.methods.mint(TestAccount.PLAYER.address).send({
        from: TestAccount.TEAM.address,
        gasPrice: await web3.eth.getGasPrice(),
        gas: gasLimit,
      });

      const farmNFT = await farm.methods
        .getFarm(1)
        .call({ from: TestAccount.PLAYER.address });

      const sfl = 600000;

      // Mint some items
      await token.methods.gameMint(farmNFT.account, sfl).send({
        from: TestAccount.TEAM.address,
        gasPrice: await web3.eth.getGasPrice(),
        gas: gasLimit,
      });

      const sessionId = await session.methods
        .getSessionId(1)
        .call({ from: TestAccount.PLAYER.address });

      const tax = 50;
      const signature = await sign(web3, {
        sessionId,
        deadline: validDeadline,
        sender: TestAccount.PLAYER.address,
        farmId: 1,
        ids: [],
        amounts: [],
        sfl,
        tax,
      });

      await session.methods
        .withdraw(signature, sessionId, validDeadline, 1, [], [], sfl, tax)
        .send({
          from: TestAccount.PLAYER.address,
          gasPrice: await web3.eth.getGasPrice(),
          gas: gasLimit,
        });

      // Expect player to only have the taxed amount
      const totalTax = sfl * (tax / 1000);
      const teamAmount = totalTax * 0.7;
      const wishingWellAmount = totalTax * 0.3;

      const teamBalance = await token.methods
        .balanceOf(TestAccount.TEAM.address)
        .call({ from: TestAccount.PLAYER.address });

      expect(teamBalance).toEqual(teamAmount.toString());

      const wishingWellBalance = await token.methods
        .balanceOf(wishingWell.options.address)
        .call({ from: TestAccount.PLAYER.address });

      expect(wishingWellBalance).toEqual(wishingWellAmount.toString());
    });

    type SyncArgs = {
      sessionId: string;
      deadline: number;
      sender: string;
      farmId: number;
      ids: number[];
      amounts: number[];
      sfl: number;
      tax: number;
    };

    function encodeSyncFunction(
      web3: Web3,
      { sessionId, deadline, sender, farmId, ids, amounts, sfl, tax }: SyncArgs
    ) {
      return web3.utils.keccak256(
        web3.eth.abi.encodeParameters(
          [
            "bytes32",
            "uint256",
            "address",
            "uint256",
            "uint256[]",
            "uint256[]",
            "uint256",
            "uint256",
          ],
          [
            sessionId,
            deadline.toString(),
            sender,
            farmId.toString(),
            ids as any,
            amounts as any,
            sfl as any,
            tax as any,
          ]
        )
      );
    }

    async function sign(web3: Web3, args: SyncArgs) {
      const sha = encodeSyncFunction(web3, args);
      const { signature } = await web3.eth.accounts.sign(
        sha,
        TestAccount.TEAM.privateKey
      );

      return signature;
    }
  });
});
