import Web3 from "web3";
import { AbiItem } from "web3-utils";
import abijson from "../bin/contracts/combined.json";

export const gasLimit = 6721975;

export class TestAccount {
  static readonly TEAM = new TestAccount( // ganache-cli account number (0)
    "0x17e0cC27d7030de22b01a0c235abbb0F99f641ba",
    "0x50a9586d7081c9d61233bcb23853e10bb4c97fdfc4212b8c050fd90d92e65c20"
  );

  static readonly CHARITY = new TestAccount( // ganache-cli account number (1)
    "0xA0C98e54Ac289A886C8a4eD93AC2F3ecE8acF65f",
    "0xd4f9fd3336dc904874ea88f88dbbc476648766c394f37b2f6f9dc62900e1e5e4"
  );

  static readonly PLAYER = new TestAccount( // ganache-cli account number (2)
    "0xAcA6b82bd697EDCa9F2fe497D55fd9F787E92e5f",
    "0xe25bed314a90ea95134f0936045598867491c4c0ac83b22b7965165d31ef961d"
  );

  private constructor(
    public readonly address: string,
    public readonly privateKey: any
  ) {}
}

export async function deploySFLContracts(web3: Web3) {
  const [inventory, token, farm, wishingWell] = await Promise.all([
    deployContract(
      web3,
      abijson.contracts["contracts/Inventory.sol:SunflowerLandInventory"],
      TestAccount.TEAM.address
    ),
    deployContract(
      web3,
      abijson.contracts["contracts/Token.sol:SunflowerLandToken"],
      TestAccount.TEAM.address
    ),
    deployContract(
      web3,
      abijson.contracts["contracts/Farm.sol:SunflowerLand"],
      TestAccount.TEAM.address
    ),
    deployContract(
      web3,
      abijson.contracts["contracts/WishingWell.sol:WishingWell"],
      TestAccount.TEAM.address,
      // We don't care about the token ERC20 and LP ERC20 for testing
      [TestAccount.TEAM.address, TestAccount.TEAM.address]
    ),
  ]);

  const session = await deployContract(
    web3,
    abijson.contracts["contracts/Sessions.sol:SunflowerLandSession"],
    TestAccount.TEAM.address,
    [inventory.options.address, token.options.address, farm.options.address]
  );

  const beta = await deployContract(
    web3,
    abijson.contracts["contracts/Beta.sol:SunflowerLandBeta"],
    TestAccount.TEAM.address,
    [farm.options.address]
  );

  await Promise.all([
    session.methods.setWishingWell(wishingWell.options.address).send({
      from: TestAccount.TEAM.address,
    }),
    farm.methods
      .addGameRole(beta.options.address)
      .send({ from: TestAccount.TEAM.address }),
    farm.methods
      .addGameRole(session.options.address)
      .send({ from: TestAccount.TEAM.address }),
    token.methods
      .addGameRole(session.options.address)
      .send({ from: TestAccount.TEAM.address }),
    inventory.methods
      .addGameRole(session.options.address)
      .send({ from: TestAccount.TEAM.address }),
  ]);

  return { session, farm, token, inventory, beta, wishingWell };
}

export async function deployMutantCropContracts(web3: Web3) {
  const [inventory, farm] = await Promise.all([
    deployContract(
      web3,
      abijson.contracts["contracts/Inventory.sol:SunflowerLandInventory"],
      TestAccount.TEAM.address
    ),
    deployContract(
      web3,
      abijson.contracts["contracts/Farm.sol:SunflowerLand"],
      TestAccount.TEAM.address
    ),
  ]);

  const mutantCrops = await deployContract(
    web3,
    abijson.contracts["contracts/MutantCrops.sol:MutantCrops"],
    TestAccount.TEAM.address,
    [inventory.options.address, farm.options.address]
  );

  await inventory.methods
    .addGameRole(mutantCrops.options.address)
    .send({ from: TestAccount.TEAM.address });

  await farm.methods
    .addGameRole(TestAccount.TEAM.address)
    .send({ from: TestAccount.TEAM.address });

  return { farm, inventory, mutantCrops };
}

export async function deployWishingWellContracts(web3: Web3) {
  const [token, liquidityTestToken, farm] = await Promise.all([
    deployContract(
      web3,
      abijson.contracts["contracts/Token.sol:SunflowerLandToken"],
      TestAccount.TEAM.address
    ),
    deployContract(
      web3,
      abijson.contracts["contracts/ERC20Testing.sol:TestToken"],
      TestAccount.TEAM.address
    ),
    deployContract(
      web3,
      abijson.contracts["contracts/Farm.sol:SunflowerLand"],
      TestAccount.TEAM.address
    ),
  ]);

  const wishingWell = await deployContract(
    web3,
    abijson.contracts["contracts/WishingWell.sol:WishingWell"],
    TestAccount.TEAM.address,
    // In production this will be the SFL/MATIC pair, but for testing we'll use SFL as it is an ERC20 as well
    [
      token.options.address,
      liquidityTestToken.options.address,
      farm.options.address,
    ]
  );
  return { token, liquidityTestToken, wishingWell, farm };
}

async function deployContract(
  web3: Web3,
  contract: { abi: {}; bin: string },
  address: string,
  args: any[] = []
) {
  const contractToDeploy = new web3.eth.Contract(contract.abi as AbiItem[]);

  return contractToDeploy
    .deploy({
      data: contract.bin,
      arguments: args,
    })
    .send({
      from: address,
      gasPrice: await web3.eth.getGasPrice(),
      gas: gasLimit,
    });
}
