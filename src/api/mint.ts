import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import Joi from "joi";

import { calculateChangeset, getChangeset, mint } from "../domain/game/game";
import { KNOWN_IDS } from "../domain/game/types";
import { InventoryItemName } from "../domain/game/types/game";
import { syncSignature, verifyAccount } from "../web3/signatures";

const schema = Joi.object({
  sessionId: Joi.string().required(),
  farmId: Joi.number().required(),
  sender: Joi.string().required(),
  signature: Joi.string().required(),
  item: Joi.string().required(),
});

type Body = {
  farmId: number;
  sessionId: string;
  sender: string;
  signature: string;
  hash: string;
  item: InventoryItemName;
};

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  if (!event.body) {
    throw new Error("No body found in event");
  }

  const body: Body = JSON.parse(event.body);
  const valid = schema.validate(body);
  if (valid.error) {
    throw new Error(valid.error.message);
  }

  verifyAccount({
    address: body.sender,
    farmId: body.farmId,
    signature: body.signature,
  });

  const changeset = await mint({
    farmId: Number(body.farmId),
    account: body.sender,
    item: body.item,
  });

  // TODO - check the total supply limit
  console.log({ changeset });

  // Once an NFT is minted they need to immediately sync to the Blockchain
  const signature = await syncSignature({
    sender: body.sender,
    farmId: body.farmId,
    sessionId: body.sessionId,
    sfl: changeset.balance,
    inventory: changeset.inventory,
  });

  console.log({ signature });

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...signature,
    }),
  };
};