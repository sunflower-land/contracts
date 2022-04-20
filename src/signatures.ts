/**
 * Session.sol function signatures
 */
import Web3 from "web3";

export type WithdrawArgs = {
  sessionId: string;
  deadline: number;
  sender: string;
  farmId: number;
  ids: number[];
  amounts: string[];
  sfl: string;
  tax: number;
  itemData: string;
};

export function encodeWithdrawFunction({
  sessionId,
  deadline,
  sender,
  farmId,
  ids,
  amounts,
  sfl,
  tax
}: WithdrawArgs) {
  const web3 = new Web3();
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
        "uint256"
      ],
      [
        sessionId,
        deadline.toString(),
        sender,
        farmId.toString(),
        ids as any,
        amounts as any,
        sfl as any,
        tax as any
      ]
    )
  );
}

export type SyncArgs = {
  sessionId: string;
  deadline: number;
  sender: string;
  farmId: number;
  mintIds: number[];
  mintAmounts: (string | number)[];
  burnIds: number[];
  burnAmounts: (string | number)[];
  tokens: string | number;
};

export function encodeSyncFunction({
  sessionId,
  tokens,
  farmId,
  mintIds,
  mintAmounts,
  sender,
  burnIds,
  burnAmounts,
  deadline
}: SyncArgs) {
  const web3 = new Web3();
  return web3.utils.keccak256(
    web3.eth.abi.encodeParameters(
      [
        "bytes32",
        "int256",
        "uint",
        "uint256[]",
        "uint256[]",
        "address",
        "uint256[]",
        "uint256[]",
        "uint"
      ],
      [
        sessionId,
        tokens,
        farmId,
        mintIds,
        mintAmounts,
        sender,
        burnIds,
        burnAmounts,
        deadline
      ]
    )
  );
}

export type WishArgs = {
  deadline: number;
  sender: string;
  tokens: number;
};

export function encodeWishArgs({ deadline, sender, tokens }: WishArgs) {
  const web3 = new Web3();
  return web3.utils.keccak256(
    web3.eth.abi.encodeParameters(
      ["uint256", "address", "uint256"],
      [tokens, sender, deadline]
    )
  );
}
