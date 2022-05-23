import Web3 from "web3";
import { encodeMutantCropFunction, MutantCropArgs } from "../src/signatures";
import {
  TestAccount,
  deployMutantCropContracts,
  gasLimit,
} from "./test-support";

enum Crops {
  Sunflower = 0,
  Potato = 1,
  Pumpkin = 2,
  Carrot = 3,
  // ...
}
describe("Mutant Crops contract", () => {
  // 20 minutes in future
  const VALID_DEADLINE = Math.floor(new Date().getTime() / 1000) + 20 * 60;

  async function sign(web3: Web3, args: MutantCropArgs) {
    const sha = encodeMutantCropFunction({
      ...args,
    });
    const { signature } = await web3.eth.accounts.sign(
      sha,
      TestAccount.TEAM.privateKey
    );

    return signature;
  }

  it("deploys with total supply zero", async function () {
    const web3 = new Web3(
      new Web3.providers.HttpProvider(process.env.ETH_NETWORK)
    );

    const { mutantCrops } = await deployMutantCropContracts(web3);

    expect(
      await mutantCrops.methods
        .totalSupply()
        .call({ from: TestAccount.TEAM.address })
    ).toEqual("0");
  });

  it("sets the metadata uri correctly", async () => {
    const web3 = new Web3(
      new Web3.providers.HttpProvider(process.env.ETH_NETWORK)
    );

    const { mutantCrops } = await deployMutantCropContracts(web3);

    await mutantCrops.methods.gameMint(TestAccount.PLAYER.address, 1).send({
      from: TestAccount.TEAM.address,
      gasPrice: await web3.eth.getGasPrice(),
      gas: gasLimit,
    });

    expect(
      await mutantCrops.methods
        .tokenURI(1)
        .call({ from: TestAccount.TEAM.address })
    ).toEqual("https://sunflower-land.com/play/nfts/mutant-crops/1");

    await mutantCrops.methods.setBaseUri("https://potato-land.com/").send({
      from: TestAccount.TEAM.address,
      gasPrice: await web3.eth.getGasPrice(),
      gas: gasLimit,
    });

    expect(
      await mutantCrops.methods
        .tokenURI(1)
        .call({ from: TestAccount.TEAM.address })
    ).toEqual("https://potato-land.com/1");
  });

  it("ensures transaction is run in the deadline", async () => {
    const web3 = new Web3(
      new Web3.providers.HttpProvider(process.env.ETH_NETWORK)
    );

    const { mutantCrops } = await deployMutantCropContracts(web3);

    // 6 minutes ago
    const expiredDeadline = 0;
    const signature = await sign(web3, {
      cropId: Crops.Sunflower,
      deadline: expiredDeadline,
      sender: TestAccount.PLAYER.address,
      farmId: 5,
    });

    const result = mutantCrops.methods
      .mint(signature, expiredDeadline, Crops.Sunflower, 5)
      .send({
        from: TestAccount.PLAYER.address,
        gasPrice: await web3.eth.getGasPrice(),
        gas: gasLimit,
      });

    await expect(
      result.catch((e: Error) => Promise.reject(e.message))
    ).rejects.toContain("MutantCrops: Deadline Passed");
  });

  it("ensures transaction is verified by the game", async () => {
    const web3 = new Web3(
      new Web3.providers.HttpProvider(process.env.ETH_NETWORK)
    );

    const { mutantCrops } = await deployMutantCropContracts(web3);

    const sha = encodeMutantCropFunction({
      cropId: 1,
      deadline: VALID_DEADLINE,
      sender: TestAccount.PLAYER.address,
      farmId: 5,
    });

    const { signature } = await web3.eth.accounts.sign(
      sha,
      // Sign by wrong entity
      TestAccount.CHARITY.privateKey
    );

    const result = mutantCrops.methods
      .mint(signature, VALID_DEADLINE, 1, 5)
      .send({
        from: TestAccount.PLAYER.address,
        gasPrice: await web3.eth.getGasPrice(),
        gas: gasLimit,
      });

    await expect(
      result.catch((e: Error) => Promise.reject(e.message))
    ).rejects.toContain("MutantCrops: Unauthorised");
  });

  it("ensures player owns the farm", async () => {
    const web3 = new Web3(
      new Web3.providers.HttpProvider(process.env.ETH_NETWORK)
    );

    const { mutantCrops, farm } = await deployMutantCropContracts(web3);

    // Mint to different account
    await farm.methods.mint(TestAccount.CHARITY.address).send({
      from: TestAccount.TEAM.address,
      gasPrice: await web3.eth.getGasPrice(),
      gas: gasLimit,
    });

    const signature = await sign(web3, {
      cropId: Crops.Sunflower,
      deadline: VALID_DEADLINE,
      sender: TestAccount.PLAYER.address,
      farmId: 1,
    });

    const result = mutantCrops.methods
      .mint(signature, VALID_DEADLINE, Crops.Sunflower, 1)
      .send({
        from: TestAccount.PLAYER.address,
        gasPrice: await web3.eth.getGasPrice(),
        gas: gasLimit,
      });

    await expect(
      result.catch((e: Error) => Promise.reject(e.message))
    ).rejects.toContain("MutantCrops: You do not own this farm");
  });

  it("ensures crops get minted sequentially", async () => {
    const web3 = new Web3(
      new Web3.providers.HttpProvider(process.env.ETH_NETWORK)
    );

    const { mutantCrops, farm } = await deployMutantCropContracts(web3);

    await farm.methods.mint(TestAccount.PLAYER.address).send({
      from: TestAccount.TEAM.address,
      gasPrice: await web3.eth.getGasPrice(),
      gas: gasLimit,
    });

    const signature = await sign(web3, {
      cropId: Crops.Potato,
      deadline: VALID_DEADLINE,
      sender: TestAccount.PLAYER.address,
      farmId: 1,
    });

    const result = mutantCrops.methods
      .mint(signature, VALID_DEADLINE, Crops.Potato, 1)
      .send({
        from: TestAccount.PLAYER.address,
        gasPrice: await web3.eth.getGasPrice(),
        gas: gasLimit,
      });

    await expect(
      result.catch((e: Error) => Promise.reject(e.message))
    ).rejects.toContain("MutantCrops: Crop is not ready");
  });

  it("mints a mutant crop", async () => {
    const web3 = new Web3(
      new Web3.providers.HttpProvider(process.env.ETH_NETWORK)
    );

    const { mutantCrops, farm, inventory } = await deployMutantCropContracts(
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

    const signature = await sign(web3, {
      cropId: Crops.Sunflower,
      deadline: VALID_DEADLINE,
      sender: TestAccount.PLAYER.address,
      farmId: 1,
    });

    await mutantCrops.methods
      .mint(signature, VALID_DEADLINE, Crops.Sunflower, 1)
      .send({
        from: TestAccount.PLAYER.address,
        gasPrice: await web3.eth.getGasPrice(),
        gas: gasLimit,
      });

    expect(
      await mutantCrops.methods
        .totalSupply()
        .call({ from: TestAccount.TEAM.address })
    ).toEqual("1");

    expect(
      await mutantCrops.methods
        .ownerOf(1)
        .call({ from: TestAccount.TEAM.address })
    ).toEqual(farmNFT.account);

    expect(
      await mutantCrops.methods
        .nextMutantCrop()
        .call({ from: TestAccount.TEAM.address })
    ).toEqual("1");

    expect(
      await inventory.methods
        .balanceOf(farmNFT.account, 912)
        .call({ from: TestAccount.TEAM.address })
    ).toEqual("1");
  });

  it("mints multiple mutant crops", async () => {
    const web3 = new Web3(
      new Web3.providers.HttpProvider(process.env.ETH_NETWORK)
    );

    const { mutantCrops, farm, inventory } = await deployMutantCropContracts(
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

    const signature = await sign(web3, {
      cropId: Crops.Sunflower,
      deadline: VALID_DEADLINE,
      sender: TestAccount.PLAYER.address,
      farmId: 1,
    });

    await mutantCrops.methods
      .mint(signature, VALID_DEADLINE, Crops.Sunflower, 1)
      .send({
        from: TestAccount.PLAYER.address,
        gasPrice: await web3.eth.getGasPrice(),
        gas: gasLimit,
      });

    const signature2 = await sign(web3, {
      cropId: Crops.Potato,
      deadline: VALID_DEADLINE,
      sender: TestAccount.PLAYER.address,
      farmId: 1,
    });

    await mutantCrops.methods
      .mint(signature2, VALID_DEADLINE, Crops.Potato, 1)
      .send({
        from: TestAccount.PLAYER.address,
        gasPrice: await web3.eth.getGasPrice(),
        gas: gasLimit,
      });

    const signature3 = await sign(web3, {
      cropId: Crops.Pumpkin,
      deadline: VALID_DEADLINE,
      sender: TestAccount.PLAYER.address,
      farmId: 1,
    });

    await mutantCrops.methods
      .mint(signature3, VALID_DEADLINE, Crops.Pumpkin, 1)
      .send({
        from: TestAccount.PLAYER.address,
        gasPrice: await web3.eth.getGasPrice(),
        gas: gasLimit,
      });

    expect(
      await mutantCrops.methods
        .totalSupply()
        .call({ from: TestAccount.TEAM.address })
    ).toEqual("3");

    expect(
      await mutantCrops.methods
        .balanceOf(farmNFT.account)
        .call({ from: TestAccount.TEAM.address })
    ).toEqual("3");

    expect(
      await mutantCrops.methods
        .nextMutantCrop()
        .call({ from: TestAccount.TEAM.address })
    ).toEqual("3");

    expect(
      await inventory.methods
        .balanceOf(farmNFT.account, 912)
        .call({ from: TestAccount.TEAM.address })
    ).toEqual("3");
  });

  it("transfers a mutant crop", async () => {
    const web3 = new Web3(
      new Web3.providers.HttpProvider(process.env.ETH_NETWORK)
    );

    const { mutantCrops, inventory } = await deployMutantCropContracts(web3);

    await mutantCrops.methods.gameMint(TestAccount.PLAYER.address, 1).send({
      from: TestAccount.TEAM.address,
      gasPrice: await web3.eth.getGasPrice(),
      gas: gasLimit,
    });

    expect(
      await mutantCrops.methods
        .ownerOf(1)
        .call({ from: TestAccount.TEAM.address })
    ).toEqual(TestAccount.PLAYER.address);

    expect(
      await inventory.methods
        .balanceOf(TestAccount.PLAYER.address, 912)
        .call({ from: TestAccount.TEAM.address })
    ).toEqual("1");

    await mutantCrops.methods
      .transferFrom(TestAccount.PLAYER.address, TestAccount.CHARITY.address, 1)
      .send({
        from: TestAccount.PLAYER.address,
        gasPrice: await web3.eth.getGasPrice(),
        gas: gasLimit,
      });

    expect(
      await mutantCrops.methods
        .ownerOf(1)
        .call({ from: TestAccount.PLAYER.address })
    ).toEqual(TestAccount.CHARITY.address);

    expect(
      await inventory.methods
        .balanceOf(TestAccount.CHARITY.address, 912)
        .call({ from: TestAccount.TEAM.address })
    ).toEqual("1");

    expect(
      await inventory.methods
        .balanceOf(TestAccount.PLAYER.address, 912)
        .call({ from: TestAccount.TEAM.address })
    ).toEqual("0");

    expect(
      await inventory.methods
        .balanceOf(TestAccount.PLAYER.address, 912)
        .call({ from: TestAccount.TEAM.address })
    ).toEqual("0");
  });
});
