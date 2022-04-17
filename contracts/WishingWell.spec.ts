import Web3 from "web3";
import { soliditySha3 } from "web3-utils";
import { encodeWishArgs, WishArgs } from "../src/signatures";
import {
  deploySFLContracts,
  deployWishingWellContracts,
  gasLimit,
  TestAccount,
} from "./test-support";

/**
 * For testing we use the SunflowerLandToken since it is ERC20
 * In production, the token will be the SFL/MATIC ERC20 pair
 */
describe("Wishing Well contract", () => {
  const validDeadline = 10000000000000;

  // Reusable function that approves and then throws in
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

  it("makes a wish", async () => {
    const web3 = new Web3(
      new Web3.providers.HttpProvider(process.env.ETH_NETWORK?process.env.ETH_NETWORK:"")
    );
    const { wishingWell, liquidityTestToken } =
      await deployWishingWellContracts(web3);

    await liquidityTestToken.methods
      .mint(TestAccount.PLAYER.address, 1000)
      .send({
        from: TestAccount.TEAM.address,
        gasPrice: await web3.eth.getGasPrice(),
        gas: gasLimit,
      });

    await wishingWell.methods.wish().send({
      from: TestAccount.PLAYER.address,
      gasPrice: await web3.eth.getGasPrice(),
      gas: gasLimit,
    });

    let balance = await wishingWell.methods
      .balanceOf(TestAccount.PLAYER.address)
      .call({ from: TestAccount.PLAYER.address });

    expect(balance).toEqual("1000");

    // Wish again and see if it increases
    await liquidityTestToken.methods
      .mint(TestAccount.PLAYER.address, 500)
      .send({
        from: TestAccount.TEAM.address,
        gasPrice: await web3.eth.getGasPrice(),
        gas: gasLimit,
      });

    await wishingWell.methods.wish().send({
      from: TestAccount.PLAYER.address,
      gasPrice: await web3.eth.getGasPrice(),
      gas: gasLimit,
    });

    balance = await wishingWell.methods
      .balanceOf(TestAccount.PLAYER.address)
      .call({ from: TestAccount.PLAYER.address });

    expect(balance).toEqual("1500");

    // Wish again and see if it decreases
    await liquidityTestToken.methods
      .burn(TestAccount.PLAYER.address, 300)
      .send({
        from: TestAccount.TEAM.address,
        gasPrice: await web3.eth.getGasPrice(),
        gas: gasLimit,
      });

    await wishingWell.methods.wish().send({
      from: TestAccount.PLAYER.address,
      gasPrice: await web3.eth.getGasPrice(),
      gas: gasLimit,
    });

    balance = await wishingWell.methods
      .balanceOf(TestAccount.PLAYER.address)
      .call({ from: TestAccount.PLAYER.address });

    expect(balance).toEqual("1200");
  });

  it("makes a user wait after making a wish", async () => {
    const web3 = new Web3(
      new Web3.providers.HttpProvider(process.env.ETH_NETWORK?process.env.ETH_NETWORK:"")
    );
    const { wishingWell, liquidityTestToken, token } =
      await deployWishingWellContracts(web3);

    await liquidityTestToken.methods
      .mint(TestAccount.PLAYER.address, 1000)
      .send({
        from: TestAccount.TEAM.address,
        gasPrice: await web3.eth.getGasPrice(),
        gas: gasLimit,
      });

    await wishingWell.methods.wish().send({
      from: TestAccount.PLAYER.address,
      gasPrice: await web3.eth.getGasPrice(),
      gas: gasLimit,
    });

    // Put 500 SFL in the well
    await token.methods.gameMint(wishingWell.options.address, 500).send({
      from: TestAccount.TEAM.address,
      gasPrice: await web3.eth.getGasPrice(),
      gas: gasLimit,
    });

    const signature = await sign(web3, {
      deadline: validDeadline,
      sender: TestAccount.PLAYER.address,
      tokens: 1000,
    });

    let result = wishingWell.methods
      .collectFromWell(signature, 1000, validDeadline)
      .send({
        from: TestAccount.PLAYER.address,
        gasPrice: await web3.eth.getGasPrice(),
        gas: gasLimit,
      });

    await expect(
      result.catch((e: Error) => Promise.reject(e.message))
    ).rejects.toContain("WishingWell: Good things come for those who wait");

    await increaseTime(web3, 3 * 24 * 60 * 60 + 1);

    await wishingWell.methods
      .collectFromWell(signature, 1000, validDeadline)
      .send({
        from: TestAccount.PLAYER.address,
        gasPrice: await web3.eth.getGasPrice(),
        gas: gasLimit,
      });

    const sflBalance = await token.methods
      .balanceOf(TestAccount.PLAYER.address)
      .call({ from: TestAccount.PLAYER.address });

    // Max rewards is only 10%
    expect(sflBalance).toBe("50");
  });

  it("ensures the user has wished tokens in the well", async () => {
    const web3 = new Web3(
      new Web3.providers.HttpProvider(process.env.ETH_NETWORK?process.env.ETH_NETWORK:"")
    );
    const { wishingWell, liquidityTestToken, token } =
      await deployWishingWellContracts(web3);

    await liquidityTestToken.methods
      .mint(TestAccount.PLAYER.address, 200)
      .send({
        from: TestAccount.TEAM.address,
        gasPrice: await web3.eth.getGasPrice(),
        gas: gasLimit,
      });

    await wishingWell.methods.wish().send({
      from: TestAccount.PLAYER.address,
      gasPrice: await web3.eth.getGasPrice(),
      gas: gasLimit,
    });

    await increaseTime(web3, 3 * 24 * 60 * 60 + 1);

    const signature = await sign(web3, {
      deadline: validDeadline,
      sender: TestAccount.PLAYER.address,
      tokens: 500,
    });

    let result = wishingWell.methods
      .collectFromWell(signature, 500, validDeadline)
      .send({
        from: TestAccount.PLAYER.address,
        gasPrice: await web3.eth.getGasPrice(),
        gas: gasLimit,
      });

    await expect(
      result.catch((e: Error) => Promise.reject(e.message))
    ).rejects.toContain("WishingWell: Not enough tokens");
  });

  it("ensures transaction is done before deadline", async () => {
    const web3 = new Web3(
      new Web3.providers.HttpProvider(process.env.ETH_NETWORK?process.env.ETH_NETWORK:"")
    );
    const { wishingWell, liquidityTestToken, token } =
      await deployWishingWellContracts(web3);

    const deadline = Math.floor(Date.now() / 1000);
    const signature = await sign(web3, {
      deadline,
      sender: TestAccount.PLAYER.address,
      tokens: 500,
    });

    let result = wishingWell.methods
      .collectFromWell(signature, 500, deadline)
      .send({
        from: TestAccount.PLAYER.address,
        gasPrice: await web3.eth.getGasPrice(),
        gas: gasLimit,
      });

    await expect(
      result.catch((e: Error) => Promise.reject(e.message))
    ).rejects.toContain("WishingWell: Deadline Passed");
  });

  it("ensures oracle has verified transaction", async () => {
    const web3 = new Web3(
      new Web3.providers.HttpProvider(process.env.ETH_NETWORK?process.env.ETH_NETWORK:"")
    );
    const { wishingWell, liquidityTestToken, token } =
      await deployWishingWellContracts(web3);

    await liquidityTestToken.methods
      .mint(TestAccount.PLAYER.address, 700)
      .send({
        from: TestAccount.TEAM.address,
        gasPrice: await web3.eth.getGasPrice(),
        gas: gasLimit,
      });

    await wishingWell.methods.wish().send({
      from: TestAccount.PLAYER.address,
      gasPrice: await web3.eth.getGasPrice(),
      gas: gasLimit,
    });

    await increaseTime(web3, 3 * 24 * 60 * 60 + 1);

    const signature = await sign(web3, {
      deadline: validDeadline,
      // A different value in the transaction
      sender: TestAccount.CHARITY.address,
      tokens: 500,
    });

    let result = wishingWell.methods
      .collectFromWell(signature, 500, validDeadline)
      .send({
        from: TestAccount.PLAYER.address,
        gasPrice: await web3.eth.getGasPrice(),
        gas: gasLimit,
      });

    await expect(
      result.catch((e: Error) => Promise.reject(e.message))
    ).rejects.toContain("WishingWell: Unauthorised");
  });

  it("collects tokens based on share in well", async () => {
    const web3 = new Web3(
      new Web3.providers.HttpProvider(process.env.ETH_NETWORK?process.env.ETH_NETWORK:"")
    );
    const { wishingWell, liquidityTestToken, token } =
      await deployWishingWellContracts(web3);

    // Put 1000 SFL in the well
    await token.methods.gameMint(wishingWell.options.address, 1000).send({
      from: TestAccount.TEAM.address,
      gasPrice: await web3.eth.getGasPrice(),
      gas: gasLimit,
    });

    // Player One
    await liquidityTestToken.methods
      .mint(TestAccount.PLAYER.address, 700)
      .send({
        from: TestAccount.TEAM.address,
        gasPrice: await web3.eth.getGasPrice(),
        gas: gasLimit,
      });

    await wishingWell.methods.wish().send({
      from: TestAccount.PLAYER.address,
      gasPrice: await web3.eth.getGasPrice(),
      gas: gasLimit,
    });

    // Player Two
    await liquidityTestToken.methods
      .mint(TestAccount.CHARITY.address, 300)
      .send({
        from: TestAccount.CHARITY.address,
        gasPrice: await web3.eth.getGasPrice(),
        gas: gasLimit,
      });

    await wishingWell.methods.wish().send({
      from: TestAccount.CHARITY.address,
      gasPrice: await web3.eth.getGasPrice(),
      gas: gasLimit,
    });

    await increaseTime(web3, 3 * 24 * 60 * 60 + 1);

    const signature = await sign(web3, {
      deadline: validDeadline,
      // A different value in the transaction
      sender: TestAccount.PLAYER.address,
      tokens: 700,
    });

    await wishingWell.methods
      .collectFromWell(signature, 700, validDeadline)
      .send({
        from: TestAccount.PLAYER.address,
        gasPrice: await web3.eth.getGasPrice(),
        gas: gasLimit,
      });

    let playerOneBalance = await token.methods
      .balanceOf(TestAccount.PLAYER.address)
      .call({ from: TestAccount.PLAYER.address });
    const playerOneWellBalance = await wishingWell.methods
      .balanceOf(TestAccount.PLAYER.address)
      .call({ from: TestAccount.PLAYER.address });

    expect(playerOneBalance).toEqual("100");
    expect(playerOneWellBalance).toEqual("700");

    const signatureTwo = await sign(web3, {
      deadline: validDeadline,
      sender: TestAccount.CHARITY.address,
      // Try a bit less than they have in the well
      tokens: 200,
    });

    // Lets burn some LP tokens before they withdraw
    await liquidityTestToken.methods
      .burn(TestAccount.CHARITY.address, 80)
      .send({
        from: TestAccount.TEAM.address,
        gasPrice: await web3.eth.getGasPrice(),
        gas: gasLimit,
      });

    await wishingWell.methods
      .collectFromWell(signatureTwo, 200, validDeadline)
      .send({
        from: TestAccount.CHARITY.address,
        gasPrice: await web3.eth.getGasPrice(),
        gas: gasLimit,
      });

    const playerTwoBalance = await token.methods
      .balanceOf(TestAccount.CHARITY.address)
      .call({ from: TestAccount.CHARITY.address });
    const playerTwoWellBalance = await wishingWell.methods
      .balanceOf(TestAccount.CHARITY.address)
      .call({ from: TestAccount.CHARITY.address });

    // 20% of remaining 300 share
    expect(playerTwoBalance).toEqual("90");
    expect(playerTwoWellBalance).toEqual("220");
  });

  async function sign(web3: Web3, args: WishArgs) {
    const sha = encodeWishArgs({
      ...args,
    });
    const { signature } = await web3.eth.accounts.sign(
      sha,
      TestAccount.TEAM.privateKey
    );

    return signature;
  }
});
