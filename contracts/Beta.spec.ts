import Web3 from "web3";
import { deploySFLContracts, TestAccount, gasLimit } from "./test-support";

describe("Beta contract", () => {
  it("creates a farm with no donation", async () => {
    const web3 = new Web3(
      new Web3.providers.HttpProvider(process.env.ETH_NETWORK?process.env.ETH_NETWORK:"")
    );
    const donation = 0;
    const { beta, farm } = await deploySFLContracts(web3);

    const signature = await sign(
      web3,
      TestAccount.TEAM.privateKey,
      TestAccount.CHARITY.address,
      donation,
      TestAccount.PLAYER.address
    );

    expect(
      await beta.methods
        .farmCreatedAt(TestAccount.PLAYER.address)
        .call({ from: TestAccount.PLAYER.address })
    ).toEqual("0");

    await beta.methods
      .createFarm(signature, TestAccount.CHARITY.address, donation)
      .send({
        from: TestAccount.PLAYER.address,
        gasPrice: await web3.eth.getGasPrice(),
        gas: gasLimit,
      });

    expect(
      await beta.methods
        .farmCreatedAt(TestAccount.PLAYER.address)
        .call({ from: TestAccount.PLAYER.address })
    ).not.toEqual("0");

    expect(
      await farm.methods.totalSupply().call({ from: TestAccount.TEAM.address })
    ).toEqual("1");
    expect(
      await farm.methods.ownerOf(1).call({ from: TestAccount.TEAM.address })
    ).toEqual(TestAccount.PLAYER.address);
  });

  it("creates a farm with a donation", async () => {
    const web3 = new Web3(
      new Web3.providers.HttpProvider(process.env.ETH_NETWORK?process.env.ETH_NETWORK:"")
    );

    const { beta, farm } = await deploySFLContracts(web3);

    const marketingWallet = "0xc0ffee254729296a45a3885639AC7E10F9d54979";
    await beta.methods.transferTeam(marketingWallet).send({
      from: TestAccount.TEAM.address,
      gasPrice: await web3.eth.getGasPrice(),
      gas: gasLimit,
    });

    const charityBalance = await web3.eth.getBalance(
      TestAccount.CHARITY.address
    );
    const marketingBalance = await web3.eth.getBalance(marketingWallet);

    const donation = 100;
    const signature = await sign(
      web3,
      TestAccount.TEAM.privateKey,
      TestAccount.CHARITY.address,
      donation,
      TestAccount.PLAYER.address
    );
    await beta.methods
      .createFarm(signature, TestAccount.CHARITY.address, donation)
      .send({
        from: TestAccount.PLAYER.address,
        gasPrice: await web3.eth.getGasPrice(),
        gas: gasLimit,
        value: donation,
      });

    expect(
      await farm.methods.totalSupply().call({ from: TestAccount.TEAM.address })
    ).toEqual("1");
    expect(
      await farm.methods.ownerOf(1).call({ from: TestAccount.TEAM.address })
    ).toEqual(TestAccount.PLAYER.address);

    const newTeamBalance = await web3.eth.getBalance(marketingWallet);
    const newCharityBalance = await web3.eth.getBalance(
      TestAccount.CHARITY.address
    );
    expect(Number(newTeamBalance)).toEqual(Number(marketingBalance) + 90);
    expect(Number(newCharityBalance)).toEqual(Number(charityBalance) + 10);
  });

  it("requires signature charity address to match in order to create a farm", async () => {
    const web3 = new Web3(
      new Web3.providers.HttpProvider(process.env.ETH_NETWORK?process.env.ETH_NETWORK:"")
    );
    const { beta } = await deploySFLContracts(web3);

    const someOtherAddress = "0x6eF5dBF9902AD320Fe49216D086B2b50AbC9328f";
    const donation = 0;
    const signature = await sign(
      web3,
      TestAccount.TEAM.privateKey,
      someOtherAddress,
      donation,
      TestAccount.PLAYER.address
    );
    const result = beta.methods
      .createFarm(signature, TestAccount.CHARITY.address, donation)
      .send({
        from: TestAccount.PLAYER.address,
        gasPrice: await web3.eth.getGasPrice(),
        gas: gasLimit,
      });

    await expect(
      result.catch((e: Error) => Promise.reject(e.message))
    ).rejects.toContain("Beta: Unauthorised");
  });

  it("requires signature donation to match in order to create a farm", async () => {
    const web3 = new Web3(
      new Web3.providers.HttpProvider(process.env.ETH_NETWORK?process.env.ETH_NETWORK:"")
    );
    const { beta } = await deploySFLContracts(web3);

    const someOtherDonation = 1;
    const donation = 0;
    const signature = await sign(
      web3,
      TestAccount.TEAM.privateKey,
      TestAccount.CHARITY.address,
      someOtherDonation
    );
    const result = beta.methods
      .createFarm(signature, TestAccount.CHARITY.address, donation)
      .send({
        from: TestAccount.PLAYER.address,
        gasPrice: await web3.eth.getGasPrice(),
        gas: gasLimit,
      });

    await expect(
      result.catch((e: Error) => Promise.reject(e.message))
    ).rejects.toContain("Beta: Unauthorised");
  });

  it("only creates a farm once per user", async () => {
    const web3 = new Web3(
      new Web3.providers.HttpProvider(process.env.ETH_NETWORK?process.env.ETH_NETWORK:"")
    );
    const donation = 0;
    const { beta, farm } = await deploySFLContracts(web3);

    const signature = await sign(
      web3,
      TestAccount.TEAM.privateKey,
      TestAccount.CHARITY.address,
      donation,
      TestAccount.PLAYER.address
    );
    await beta.methods
      .createFarm(signature, TestAccount.CHARITY.address, donation)
      .send({
        from: TestAccount.PLAYER.address,
        gasPrice: await web3.eth.getGasPrice(),
        gas: gasLimit,
      });

    const result = beta.methods
      .createFarm(signature, TestAccount.CHARITY.address, donation)
      .send({
        from: TestAccount.PLAYER.address,
        gasPrice: await web3.eth.getGasPrice(),
        gas: gasLimit,
      });

    await expect(
      result.catch((e: Error) => Promise.reject(e.message))
    ).rejects.toContain("Beta: Farm already created");
  });

  it("transfers the signing role", async () => {
    const web3 = new Web3(
      new Web3.providers.HttpProvider(process.env.ETH_NETWORK?process.env.ETH_NETWORK:"")
    );
    const { beta, farm } = await deploySFLContracts(web3);

    const donation = 0;
    const signature = await sign(
      web3,
      TestAccount.CHARITY.privateKey,
      TestAccount.CHARITY.address,
      donation,
      TestAccount.PLAYER.address
    );

    const result = beta.methods
      .createFarm(signature, TestAccount.CHARITY.address, donation)
      .send({
        from: TestAccount.PLAYER.address,
        gasPrice: await web3.eth.getGasPrice(),
        gas: gasLimit,
      });

    await expect(
      result.catch((e: Error) => Promise.reject(e.message))
    ).rejects.toContain("Beta: Unauthorised");

    await beta.methods.transferSigner(TestAccount.CHARITY.address).send({
      from: TestAccount.TEAM.address,
      gasPrice: await web3.eth.getGasPrice(),
      gas: gasLimit,
    });

    await beta.methods
      .createFarm(signature, TestAccount.CHARITY.address, donation)
      .send({
        from: TestAccount.PLAYER.address,
        gasPrice: await web3.eth.getGasPrice(),
        gas: gasLimit,
      });

    expect(
      await farm.methods.totalSupply().call({ from: TestAccount.TEAM.address })
    ).toEqual("1");
  });

  async function sign(web3: Web3, account: string, ...args: any) {
    const txHash = web3.utils.keccak256(web3.utils.encodePacked(...args)!);
    const { signature } = await web3.eth.accounts.sign(txHash, account);

    return signature;
  }
});
