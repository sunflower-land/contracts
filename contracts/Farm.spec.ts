import Web3 from "web3";
import { deploySFLContracts, TestAccount, gasLimit } from "./test-support";

describe("Farm contract", () => {
  it("deploys with total supply zero", async function () {
    const web3 = new Web3(
      new Web3.providers.HttpProvider(process.env.ETH_NETWORK?process.env.ETH_NETWORK:"")
    );

    const { farm } = await deploySFLContracts(web3);

    expect(
      await farm.methods.totalSupply().call({ from: TestAccount.TEAM.address })
    ).toEqual("0");
  });

  it("does not pass the game role", async () => {
    const web3 = new Web3(
      new Web3.providers.HttpProvider(process.env.ETH_NETWORK?process.env.ETH_NETWORK:"")
    );

    const { farm } = await deploySFLContracts(web3);

    const result = farm.methods
      .addGameRole(TestAccount.PLAYER.address)
      .call({ from: TestAccount.PLAYER.address });

    await expect(
      result.catch((e: Error) => Promise.reject(e.message))
    ).rejects.toContain("Ownable: caller is not the owner");
  });

  it("passes the game role", async () => {
    const web3 = new Web3(
      new Web3.providers.HttpProvider(process.env.ETH_NETWORK?process.env.ETH_NETWORK:"")
    );

    const { farm } = await deploySFLContracts(web3);

    // Try mint without the game role
    const result = farm.methods.mint(TestAccount.PLAYER.address).send({
      from: TestAccount.PLAYER.address,
      gasPrice: await web3.eth.getGasPrice(),
      gas: gasLimit,
    });

    await expect(
      result.catch((e: Error) => Promise.reject(e.message))
    ).rejects.toContain("SunflowerLandGame: You are not the game");

    // Give them the game role
    await farm.methods
      .addGameRole(TestAccount.PLAYER.address)
      .send({ from: TestAccount.TEAM.address });

    await farm.methods.mint(TestAccount.PLAYER.address).send({
      from: TestAccount.PLAYER.address,
      gasPrice: await web3.eth.getGasPrice(),
      gas: gasLimit,
    });

    expect(
      await farm.methods
        .totalSupply()
        .call({ from: TestAccount.PLAYER.address })
    ).toEqual("1");

    // Take away the game role
    await farm.methods
      .removeGameRole(TestAccount.PLAYER.address)
      .send({ from: TestAccount.TEAM.address });

    // Try mint without the game role
    const result2 = farm.methods.mint(TestAccount.PLAYER.address).send({
      from: TestAccount.PLAYER.address,
      gasPrice: await web3.eth.getGasPrice(),
      gas: gasLimit,
    });

    await expect(
      result2.catch((e: Error) => Promise.reject(e.message))
    ).rejects.toContain("SunflowerLandGame: You are not the game");
  });

  it("does not mint a farm without permission", async () => {
    const web3 = new Web3(
      new Web3.providers.HttpProvider(process.env.ETH_NETWORK?process.env.ETH_NETWORK:"")
    );

    const { farm } = await deploySFLContracts(web3);

    const result = farm.methods.mint(TestAccount.PLAYER.address).send({
      from: TestAccount.PLAYER.address,
      gasPrice: await web3.eth.getGasPrice(),
      gas: gasLimit,
    });

    await expect(
      result.catch((e: Error) => Promise.reject(e.message))
    ).rejects.toContain("SunflowerLandGame: You are not the game");
  });

  it("mints a farm", async () => {
    const web3 = new Web3(
      new Web3.providers.HttpProvider(process.env.ETH_NETWORK?process.env.ETH_NETWORK:"")
    );
    const { farm } = await deploySFLContracts(web3);

    await farm.methods.mint(TestAccount.PLAYER.address).send({
      from: TestAccount.TEAM.address,
      gasPrice: await web3.eth.getGasPrice(),
      gas: gasLimit,
    });

    const newFarm = await farm.methods
      .getFarm(1)
      .call({ from: TestAccount.PLAYER.address });

    expect(
      await farm.methods
        .balanceOf(TestAccount.PLAYER.address)
        .call({ from: TestAccount.PLAYER.address })
    ).toEqual("1");
    expect(
      await farm.methods
        .totalSupply()
        .call({ from: TestAccount.PLAYER.address })
    ).toEqual("1");

    expect(newFarm[0]).toEqual(TestAccount.PLAYER.address);
    expect(newFarm[1]).toEqual(expect.any(String));
    expect(newFarm[2]).toEqual("1");
  });

  it("mints multiple farms", async () => {
    const web3 = new Web3(
      new Web3.providers.HttpProvider(process.env.ETH_NETWORK?process.env.ETH_NETWORK:"")
    );
    const { farm } = await deploySFLContracts(web3);

    const farmOnePromise = farm.methods.mint(TestAccount.PLAYER.address).send({
      from: TestAccount.TEAM.address,
      gasPrice: await web3.eth.getGasPrice(),
      gas: gasLimit,
    });
    const farmTwoPromise = farm.methods.mint(TestAccount.PLAYER.address).send({
      from: TestAccount.TEAM.address,
      gasPrice: await web3.eth.getGasPrice(),
      gas: gasLimit,
    });

    await Promise.all([farmOnePromise, farmTwoPromise]);

    const farms = await farm.methods
      .getFarms(TestAccount.PLAYER.address)
      .call({ from: TestAccount.PLAYER.address });

    expect(
      await farm.methods
        .balanceOf(TestAccount.PLAYER.address)
        .call({ from: TestAccount.PLAYER.address })
    ).toEqual("2");
    expect(
      await farm.methods
        .totalSupply()
        .call({ from: TestAccount.PLAYER.address })
    ).toEqual("2");

    expect(farms.length).toEqual(2);
  });

  it("does not change the baseURI without permission", async () => {
    const web3 = new Web3(
      new Web3.providers.HttpProvider(process.env.ETH_NETWORK?process.env.ETH_NETWORK:"")
    );

    const { farm } = await deploySFLContracts(web3);

    const result = farm.methods.setBaseUri("https://test.com").send({
      from: TestAccount.PLAYER.address,
      gasPrice: await web3.eth.getGasPrice(),
      gas: gasLimit,
    });

    await expect(
      result.catch((e: Error) => Promise.reject(e.message))
    ).rejects.toContain("Ownable: caller is not the owner");
  });

  it("updates the baseURI", async () => {
    const web3 = new Web3(
      new Web3.providers.HttpProvider(process.env.ETH_NETWORK?process.env.ETH_NETWORK:"")
    );

    const { farm } = await deploySFLContracts(web3);

    await farm.methods.mint(TestAccount.PLAYER.address).send({
      from: TestAccount.TEAM.address,
      gasPrice: await web3.eth.getGasPrice(),
      gas: gasLimit,
    });
    const url = await farm.methods
      .tokenURI(1)
      .call({ from: TestAccount.TEAM.address });

    expect(url).toEqual("https://sunflower-land.com/play/nfts/farm/1");

    await farm.methods.setBaseUri("https://test.com/").send({
      from: TestAccount.TEAM.address,
      gasPrice: await web3.eth.getGasPrice(),
      gas: gasLimit,
    });

    const newUrl = await farm.methods
      .tokenURI(1)
      .call({ from: TestAccount.TEAM.address });
    expect(newUrl).toEqual("https://test.com/1");
  });

  it("does not transfer the farm without permission", async () => {
    const web3 = new Web3(
      new Web3.providers.HttpProvider(process.env.ETH_NETWORK?process.env.ETH_NETWORK:"")
    );

    const { farm } = await deploySFLContracts(web3);

    await farm.methods.mint(TestAccount.PLAYER.address).send({
      from: TestAccount.TEAM.address,
      gasPrice: await web3.eth.getGasPrice(),
      gas: gasLimit,
    });
    const result = farm.methods
      .gameTransfer(TestAccount.PLAYER.address, TestAccount.TEAM.address, 1)
      .send({
        from: TestAccount.PLAYER.address,
        gasPrice: await web3.eth.getGasPrice(),
        gas: gasLimit,
      });

    await expect(
      result.catch((e: Error) => Promise.reject(e.message))
    ).rejects.toContain("SunflowerLandGame: You are not the game");
  });

  it("transfers the farm", async () => {
    const web3 = new Web3(
      new Web3.providers.HttpProvider(process.env.ETH_NETWORK?process.env.ETH_NETWORK:"")
    );

    const { farm } = await deploySFLContracts(web3);

    await farm.methods.mint(TestAccount.PLAYER.address).send({
      from: TestAccount.TEAM.address,
      gasPrice: await web3.eth.getGasPrice(),
      gas: gasLimit,
    });
    expect(
      await farm.methods
        .balanceOf(TestAccount.PLAYER.address)
        .call({ from: TestAccount.PLAYER.address })
    ).toEqual("1");
    expect(
      await farm.methods
        .balanceOf(TestAccount.TEAM.address)
        .call({ from: TestAccount.PLAYER.address })
    ).toEqual("0");

    await farm.methods
      .gameTransfer(TestAccount.PLAYER.address, TestAccount.TEAM.address, 1)
      .send({
        from: TestAccount.TEAM.address,
        gasPrice: await web3.eth.getGasPrice(),
        gas: gasLimit,
      });

    expect(
      await farm.methods
        .balanceOf(TestAccount.TEAM.address)
        .call({ from: TestAccount.PLAYER.address })
    ).toEqual("1");
    expect(
      await farm.methods
        .balanceOf(TestAccount.PLAYER.address)
        .call({ from: TestAccount.PLAYER.address })
    ).toEqual("0");
  });

  it("does not approve a farm without permission", async () => {
    const web3 = new Web3(
      new Web3.providers.HttpProvider(process.env.ETH_NETWORK?process.env.ETH_NETWORK:"")
    );

    const { farm } = await deploySFLContracts(web3);

    await farm.methods.mint(TestAccount.PLAYER.address).send({
      from: TestAccount.TEAM.address,
      gasPrice: await web3.eth.getGasPrice(),
      gas: gasLimit,
    });
    const result = farm.methods.gameApprove(TestAccount.TEAM.address, 1).send({
      from: TestAccount.PLAYER.address,
      gasPrice: await web3.eth.getGasPrice(),
      gas: gasLimit,
    });

    await expect(
      result.catch((e: Error) => Promise.reject(e.message))
    ).rejects.toContain("SunflowerLandGame: You are not the game");
  });

  it("does not burn a farm without permission", async () => {
    const web3 = new Web3(
      new Web3.providers.HttpProvider(process.env.ETH_NETWORK?process.env.ETH_NETWORK:"")
    );

    const { farm } = await deploySFLContracts(web3);

    await farm.methods.mint(TestAccount.PLAYER.address).send({
      from: TestAccount.TEAM.address,
      gasPrice: await web3.eth.getGasPrice(),
      gas: gasLimit,
    });
    const result = farm.methods.gameBurn(1).send({
      from: TestAccount.PLAYER.address,
      gasPrice: await web3.eth.getGasPrice(),
      gas: gasLimit,
    });

    await expect(
      result.catch((e: Error) => Promise.reject(e.message))
    ).rejects.toContain("SunflowerLandGame: You are not the game");
  });

  it("burns a farm", async () => {
    const web3 = new Web3(
      new Web3.providers.HttpProvider(process.env.ETH_NETWORK?process.env.ETH_NETWORK:"")
    );

    const { farm } = await deploySFLContracts(web3);

    await farm.methods.mint(TestAccount.PLAYER.address).send({
      from: TestAccount.TEAM.address,
      gasPrice: await web3.eth.getGasPrice(),
      gas: gasLimit,
    });
    await farm.methods.mint(TestAccount.PLAYER.address).send({
      from: TestAccount.TEAM.address,
      gasPrice: await web3.eth.getGasPrice(),
      gas: gasLimit,
    });

    expect(
      await farm.methods
        .balanceOf(TestAccount.PLAYER.address)
        .call({ from: TestAccount.PLAYER.address })
    ).toEqual("2");

    await farm.methods.gameBurn(2).send({
      from: TestAccount.TEAM.address,
      gasPrice: await web3.eth.getGasPrice(),
      gas: gasLimit,
    });

    expect(
      await farm.methods
        .balanceOf(TestAccount.PLAYER.address)
        .call({ from: TestAccount.PLAYER.address })
    ).toEqual("1");
  });

  it("transfers a farm", async () => {
    const web3 = new Web3(
      new Web3.providers.HttpProvider(process.env.ETH_NETWORK?process.env.ETH_NETWORK:"")
    );

    const { farm } = await deploySFLContracts(web3);

    await farm.methods.mint(TestAccount.PLAYER.address).send({
      from: TestAccount.TEAM.address,
      gasPrice: await web3.eth.getGasPrice(),
      gas: gasLimit,
    });

    expect(
      await farm.methods
        .balanceOf(TestAccount.PLAYER.address)
        .call({ from: TestAccount.PLAYER.address })
    ).toEqual("1");

    await farm.methods
      .transferFrom(TestAccount.PLAYER.address, TestAccount.TEAM.address, 1)
      .send({
        from: TestAccount.PLAYER.address,
        gasPrice: await web3.eth.getGasPrice(),
        gas: gasLimit,
      });

    expect(
      await farm.methods
        .balanceOf(TestAccount.PLAYER.address)
        .call({ from: TestAccount.PLAYER.address })
    ).toEqual("0");
  });

  it("pause and plays transfers", async () => {
    const web3 = new Web3(
      new Web3.providers.HttpProvider(process.env.ETH_NETWORK?process.env.ETH_NETWORK:"")
    );

    const { farm } = await deploySFLContracts(web3);

    await farm.methods.mint(TestAccount.PLAYER.address).send({
      from: TestAccount.TEAM.address,
      gasPrice: await web3.eth.getGasPrice(),
      gas: gasLimit,
    });

    await farm.methods.pause().send({
      from: TestAccount.TEAM.address,
      gasPrice: await web3.eth.getGasPrice(),
      gas: gasLimit,
    });

    const result = farm.methods
      .transferFrom(TestAccount.PLAYER.address, TestAccount.TEAM.address, 1)
      .send({
        from: TestAccount.PLAYER.address,
        gasPrice: await web3.eth.getGasPrice(),
        gas: gasLimit,
      });

    await expect(
      result.catch((e: Error) => Promise.reject(e.message))
    ).rejects.toContain("ERC721Pausable: token transfer while paused");

    await farm.methods.unpause().send({
      from: TestAccount.TEAM.address,
      gasPrice: await web3.eth.getGasPrice(),
      gas: gasLimit,
    });

    await farm.methods
      .transferFrom(TestAccount.PLAYER.address, TestAccount.TEAM.address, 1)
      .send({
        from: TestAccount.PLAYER.address,
        gasPrice: await web3.eth.getGasPrice(),
        gas: gasLimit,
      });

    expect(
      await farm.methods
        .balanceOf(TestAccount.PLAYER.address)
        .call({ from: TestAccount.PLAYER.address })
    ).toEqual("0");
  });
});
