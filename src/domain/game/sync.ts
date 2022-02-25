import Decimal from "decimal.js-light";
import { toWei } from "web3-utils";

import { getFarmById } from "../../repository/farms";
import { GameState, InventoryItemName, Inventory } from "./types/game";
import { LimitedItems, CraftableName, LimitedItem } from "./types/craftables";

import { getItemUnit } from "../../services/web3/utils";
import { craft } from "./events/craft";
import { makeGame } from "./lib/transforms";
import { loadItemSupply } from "../../services/web3/polygon";
import { KNOWN_IDS } from "./types";
import { syncSignature } from "../../services/web3/signatures";

type CalculateChangesetArgs = {
  id: number;
  owner: string;
};

export async function sync({ id, owner }: CalculateChangesetArgs) {
  const farm = await getFarmById(owner, id);
  if (!farm) {
    throw new Error("Farm does not exist");
  }

  // TODO throw error if blacklisted

  const current = makeGame(farm.gameState);
  const previous = makeGame(farm.previousGameState);

  const changeset = calculateChangeset({ current, previous });

  const signature = await syncSignature({
    sender: owner,
    farmId: id,
    sessionId: farm.sessionId as string,
    sfl: changeset.balance,
    inventory: changeset.inventory,
  });

  return signature;
}

export function calculateChangeset({
  current,
  previous,
}: {
  current: GameState;
  previous: GameState;
}): GameState {
  const balance = current.balance.minus(previous.balance);
  const wei = new Decimal(toWei(balance.toString()));

  const items = [
    ...new Set([
      ...(Object.keys(current.inventory) as InventoryItemName[]),
      ...(Object.keys(previous.inventory) as InventoryItemName[]),
    ]),
  ];

  const inventory: Inventory = items.reduce((inv, name) => {
    const amount = (current.inventory[name] || new Decimal(0)).sub(
      previous.inventory[name] || new Decimal(0)
    );

    if (amount.equals(0)) {
      return inv;
    }

    const unit = getItemUnit(name);

    return {
      ...inv,
      [name]: new Decimal(toWei(amount.toString(), unit)),
    };
  }, {});

  return {
    ...current,
    balance: wei,
    inventory,
  };
}

type MintOptions = {
  farmId: number;
  account: string;
  item: LimitedItem;
};

/**
 * Creates the changeset
 */
export async function mint({ farmId, account, item }: MintOptions) {
  const farm = await getFarmById(account, farmId);
  if (!farm) {
    throw new Error("Farm does not exist");
  }

  // TODO: prevent if blacklisted

  // Pass numbers into a safe format before processing.
  const gameState = makeGame(farm.gameState);

  const newGameState = craft({
    state: gameState,
    action: {
      type: "item.crafted",
      item,
      amount: 1,
    },
    available: Object.keys(LimitedItems) as CraftableName[],
  });

  const supply = await loadItemSupply(KNOWN_IDS[item]);
  const craftable = LimitedItems[item];
  if (!craftable.supply || new Decimal(supply).gte(craftable.supply)) {
    throw new Error("Total supply reached for item");
  }

  const changeset = calculateChangeset({
    current: newGameState,
    previous: makeGame(farm.previousGameState),
  });

  return changeset;
}
