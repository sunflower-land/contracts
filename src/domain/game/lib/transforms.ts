import Decimal from "decimal.js-light";
import { fromWei } from "web3-utils";

import { Account } from "../../../repository/farms";
import { getItemUnit } from "../../../services/web3/utils";
import { KNOWN_IDS } from "../types";
import { GameState, Inventory, InventoryItemName } from "../types/game";

export function makeGame(gameState: Account["gameState"]): GameState {
  // Convert the string values into decimals
  const inventory = Object.keys(gameState.inventory).reduce(
    (items, itemName) => ({
      ...items,
      [itemName]: new Decimal(
        gameState.inventory[itemName as InventoryItemName] || 0
      ),
    }),
    {} as Record<InventoryItemName, Decimal>
  );

  // Convert the string values into decimals
  const stock = Object.keys(gameState.stock).reduce(
    (items, itemName) => ({
      ...items,
      [itemName]: new Decimal(
        gameState.stock[itemName as InventoryItemName] || 0
      ),
    }),
    {} as Record<InventoryItemName, Decimal>
  );

  return {
    ...gameState,
    balance: new Decimal(gameState.balance),
    inventory,
    stock,
  };
}

/**
 * Convert an onchain inventory into the supported game inventory
 * Returned as wei - ['0', '0', '0' ]
 */
export function makeInventory(amounts: string[]): Inventory {
  const inventoryItems = Object.keys(KNOWN_IDS) as InventoryItemName[];

  const inventory = amounts.reduce((items, amount, index) => {
    const name = inventoryItems[index];
    const unit = getItemUnit(name);
    const value = new Decimal(fromWei(amount, unit));

    if (value.equals(0)) {
      return items;
    }

    return {
      ...items,
      [name]: value,
    };
  }, {} as Inventory);

  return inventory;
}