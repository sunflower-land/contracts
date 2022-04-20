import Web3 from "web3";
import { keccak256, AbiItem } from "web3-utils";
import { deploySFLContracts, TestAccount, gasLimit, getTokenBytecode, concatTokenBytecodes } from "./test-support";

import abijson from "../bin/contracts/combined.json"; //Move this to test-support

describe("InventoryTokenWrapper contract", () => {

  it("does not pass the game role", async () => {
    const web3 = new Web3(
      new Web3.providers.HttpProvider(process.env.ETH_NETWORK?process.env.ETH_NETWORK:"")
    );

    const { tokenWrapper } = await deploySFLContracts(web3);

    const result = tokenWrapper.methods
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

    const { tokenWrapper } = await deploySFLContracts(web3);

    const tokenData = getTokenBytecode("Token", "TKN", 18);

    // Try add token data without the game role
    const result = tokenWrapper.methods.gameDeployWrappedToken(1,  tokenData).send({
      from: TestAccount.PLAYER.address,
      gasPrice: await web3.eth.getGasPrice(),
      gas: gasLimit,
    });

    await expect(
      result.catch((e: Error) => Promise.reject(e.message))
    ).rejects.toContain("SunflowerLandGame: You are not the game");

    // Give them the game role
    await tokenWrapper.methods
      .addGameRole(TestAccount.PLAYER.address)
      .send({ from: TestAccount.TEAM.address });

    await tokenWrapper.methods.gameDeployWrappedToken(1,  tokenData).send({
      from: TestAccount.PLAYER.address,
      gasPrice: await web3.eth.getGasPrice(),
      gas: gasLimit,
    });

    expect(
      await tokenWrapper.methods
        .balanceOf(TestAccount.PLAYER.address, 1, tokenData)
        .call({ from: TestAccount.PLAYER.address })
    ).toEqual("0");

    // Take away the game role
    await tokenWrapper.methods
      .removeGameRole(TestAccount.PLAYER.address)
      .send({ from: TestAccount.TEAM.address });

    const result2 = tokenWrapper.methods.gameDeployWrappedToken(1,  tokenData).send({
      from: TestAccount.PLAYER.address,
      gasPrice: await web3.eth.getGasPrice(),
      gas: gasLimit,
    });

    await expect(
      result2.catch((e: Error) => Promise.reject(e.message))
    ).rejects.toContain("SunflowerLandGame: You are not the game");
  });

  it("does not deploy a wrapped token implementation without permission", async () => {
    const web3 = new Web3(
      new Web3.providers.HttpProvider(process.env.ETH_NETWORK? process.env.ETH_NETWORK: "")
    );

    const { tokenWrapper, inventory } = await deploySFLContracts(web3);

    {
      const result = tokenWrapper.methods
      .gameDeployWrappedToken(1, getTokenBytecode("Token", "TKN", 18)).send({
        from: TestAccount.PLAYER.address,
        gasPrice: await web3.eth.getGasPrice(),
        gas: gasLimit,
      });
      await expect(
        result.catch((e: Error) => Promise.reject(e.message))
      ).rejects.toContain("SunflowerLandGame: You are not the game");
    }

  });

  it("deploys a wrapped token implementation", async () => {

    const web3 = new Web3(
      new Web3.providers.HttpProvider(process.env.ETH_NETWORK?process.env.ETH_NETWORK:"")
    );
    const { tokenWrapper, inventory } = await deploySFLContracts(web3);

    const tokenData = getTokenBytecode("TOKEN", "TKN", 18);

    await tokenWrapper.methods
      .gameDeployWrappedToken(1, tokenData).send({
      from: TestAccount.TEAM.address,
      gasPrice: await web3.eth.getGasPrice(),
      gas: gasLimit,
    });

    const wrappedTokenAddress = await tokenWrapper.methods
      .getWrapped1155(inventory.options.address, 1 ,tokenData)
      .call({ from: TestAccount.PLAYER.address });

    const wrappedTokenContract = new web3.eth.Contract(
      abijson.contracts["contracts/WrappedERC1155.sol:Wrapped1155"].abi as AbiItem[], 
      wrappedTokenAddress
    );

    const tokenName = await wrappedTokenContract.methods
      .name()
      .call({ from: TestAccount.PLAYER.address });
    expect(tokenName).toEqual("TOKEN");
      
    const tokenSymbol = await wrappedTokenContract.methods
      .symbol()
      .call({ from: TestAccount.PLAYER.address });
    expect(tokenSymbol).toEqual("TKN");

    const tokenDecimals = await wrappedTokenContract.methods
      .decimals()
      .call({ from: TestAccount.PLAYER.address });
    expect(tokenDecimals).toEqual("18");

    expect(
      await wrappedTokenContract.methods
        .balanceOf(TestAccount.PLAYER.address)
        .call({ from: TestAccount.PLAYER.address })
    ).toEqual("0");

    expect(
      await tokenWrapper.methods
        .balanceOf(TestAccount.PLAYER.address, 1, getTokenBytecode("TOKEN", "TKN", 18))
        .call({ from: TestAccount.PLAYER.address })
    ).toEqual("0");

  });

  it("does not mint undeployed wrapped token to multitoken sender", async () => {
    const web3 = new Web3(
      new Web3.providers.HttpProvider(process.env.ETH_NETWORK? process.env.ETH_NETWORK: "")
    );

    const { tokenWrapper, inventory } = await deploySFLContracts(web3);

    const tokenData = getTokenBytecode("Token", "TKN", 18);

    await inventory.methods
      .gameMint(TestAccount.PLAYER.address, [1], [500], tokenData )
      .send({
        from: TestAccount.TEAM.address,
        gasPrice: await web3.eth.getGasPrice(),
        gas: gasLimit,
    });

    expect(await 
      inventory.methods
      .balanceOf(TestAccount.PLAYER.address, 1)
      .call(
        {from: TestAccount.PLAYER.address}))
    .toEqual("500");

    const result = inventory.methods
      .gameTransferFrom(
        TestAccount.PLAYER.address, 
        tokenWrapper.options.address, 
        [1], 
        [300],
        tokenData
      )
      .send({
        from: TestAccount.TEAM.address,
        gasPrice: await web3.eth.getGasPrice(),
        gas: gasLimit,
      });

      await expect(
        result.catch((e: Error) => Promise.reject(e.message))
      ).rejects.toContain("Wrapped1155Factory: Wrapped1155 not deployed");
    
    // const playerInventory = await inventory.methods
    //   .balanceOf(TestAccount.PLAYER.address, 1)
    //   .call({from: TestAccount.PLAYER.address});
    // expect(playerInventory).toEqual("200");

    // const playerWrappedTokens = await tokenWrapper.methods
    //   .balanceOf(TestAccount.PLAYER.address, 1, tokenData)
    //   .call({from: TestAccount.PLAYER.address});
    // expect(playerWrappedTokens).toEqual("300");


  });

  it("mints wrapped token to multitoken sender", async () => {
    const web3 = new Web3(
      new Web3.providers.HttpProvider(process.env.ETH_NETWORK? process.env.ETH_NETWORK: "")
    );

    const { tokenWrapper, inventory } = await deploySFLContracts(web3);

    const tokenData = getTokenBytecode("Token", "TKN", 18);

    const wrappedToken = await tokenWrapper.methods
    .gameDeployWrappedToken(1, tokenData).send({
      from: TestAccount.TEAM.address,
      gasPrice: await web3.eth.getGasPrice(),
      gas: gasLimit,
    });

    await inventory.methods
      .gameMint(TestAccount.PLAYER.address, [1], [500], tokenData )
      .send({
        from: TestAccount.TEAM.address,
        gasPrice: await web3.eth.getGasPrice(),
        gas: gasLimit,
      });

    expect(await 
      inventory.methods
      .balanceOf(TestAccount.PLAYER.address, 1)
      .call(
        {from: TestAccount.PLAYER.address}))
    .toEqual("500");

    await inventory.methods
      .gameTransferFrom(
        TestAccount.PLAYER.address, 
        tokenWrapper.options.address, 
        [1], 
        [300], 
        tokenData
      )
      .send({
        from: TestAccount.TEAM.address,
        gasPrice: await web3.eth.getGasPrice(),
        gas: gasLimit,
      });
    
    const playerInventory = await inventory.methods
      .balanceOf(TestAccount.PLAYER.address, 1)
      .call({from: TestAccount.PLAYER.address});
    expect(playerInventory).toEqual("200");

    const playerWrappedTokens = await tokenWrapper.methods
      .balanceOf(TestAccount.PLAYER.address, 1, tokenData)
      .call({from: TestAccount.PLAYER.address});
    expect(playerWrappedTokens).toEqual("300");


  });

  it("mints multiple deployed wrapped tokens to multitoken sender", async () => {
    const web3 = new Web3(
      new Web3.providers.HttpProvider(process.env.ETH_NETWORK? process.env.ETH_NETWORK: "")
    );

    const { tokenWrapper, inventory } = await deploySFLContracts(web3);

    const tokenData1 = getTokenBytecode("Token1", "TK1", 18);
    const tokenData2 = getTokenBytecode("Token1", "TK2", 18);

    const allTokensData = concatTokenBytecodes(tokenData1, tokenData2);

    await tokenWrapper.methods
      .gameDeployWrappedToken(1, tokenData1).send({
      from: TestAccount.TEAM.address,
      gasPrice: await web3.eth.getGasPrice(),
      gas: gasLimit,
    });

    await tokenWrapper.methods
      .gameDeployWrappedToken(2, tokenData2).send({
      from: TestAccount.TEAM.address,
      gasPrice: await web3.eth.getGasPrice(),
      gas: gasLimit,
    });

    await inventory.methods
      .gameMint(TestAccount.PLAYER.address, [1, 2], [500, 700], allTokensData )
      .send({
        from: TestAccount.TEAM.address,
        gasPrice: await web3.eth.getGasPrice(),
        gas: gasLimit,
    });

    expect(await 
      inventory.methods
      .balanceOf(TestAccount.PLAYER.address, 1)
      .call(
        {from: TestAccount.PLAYER.address}))
    .toEqual("500");

    expect(await 
      inventory.methods
      .balanceOf(TestAccount.PLAYER.address, 2)
      .call(
        {from: TestAccount.PLAYER.address}))
    .toEqual("700");

    await inventory.methods
      .gameTransferFrom(
        TestAccount.PLAYER.address, 
        tokenWrapper.options.address, 
        [1, 2],
        [100, 200],
        allTokensData
      )
      .send({
        from: TestAccount.TEAM.address,
        gasPrice: await web3.eth.getGasPrice(),
        gas: gasLimit,
      });
    
    const playerInventory1 = await inventory.methods
      .balanceOf(TestAccount.PLAYER.address, 1)
      .call({from: TestAccount.PLAYER.address});
    expect(playerInventory1).toEqual("400");

    const playerWrappedTokens1 = await tokenWrapper.methods
      .balanceOf(TestAccount.PLAYER.address, 1, tokenData1)
      .call({from: TestAccount.PLAYER.address});
    expect(playerWrappedTokens1).toEqual("100");

    const playerInventory2 = await inventory.methods
      .balanceOf(TestAccount.PLAYER.address, 2)
      .call({from: TestAccount.PLAYER.address});
    expect(playerInventory2).toEqual("500");

    const playerWrappedTokens2 = await tokenWrapper.methods
      .balanceOf(TestAccount.PLAYER.address, 2, tokenData2)
      .call({from: TestAccount.PLAYER.address});
    expect(playerWrappedTokens2).toEqual("200");

  });

});
