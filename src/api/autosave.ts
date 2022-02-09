import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import Joi from "joi";

import { verifyAccount } from "../services/web3/signatures";
import { GameAction, MILLISECONDS_TO_SAVE, save } from "../domain/game/game";

const eventTimeValidation = () =>
  Joi.date()
    .iso()
    .greater(Date.now() - MILLISECONDS_TO_SAVE)
    .less("now");

// Thunk it so we can get the current time on runtime
const schema = () =>
  Joi.object<AutosaveBody>({
    actions: Joi.array()
      .items(
        Joi.alternatives().try(
          Joi.object({
            type: Joi.string().equal("item.crafted"),
            item: Joi.string(),
            amount: Joi.number().min(1).max(10).integer(),
            createdAt: eventTimeValidation(),
          }),
          Joi.object({
            type: Joi.string().equal("item.sell"),
            item: Joi.string(),
            amount: Joi.number().min(1).max(10).integer(),
            createdAt: eventTimeValidation(),
          }),
          Joi.object({
            type: Joi.string().equal("item.planted"),
            item: Joi.string(),
            index: Joi.number().min(0).max(21).integer(),
            createdAt: eventTimeValidation(),
          }),
          Joi.object({
            type: Joi.string().equal("item.harvested"),
            index: Joi.number().min(0).max(21).integer(),
            createdAt: eventTimeValidation(),
          })
        )
      )
      .required()
      .min(1),
    farmId: Joi.number().required(),
    sender: Joi.string().required(),
    signature: Joi.string().required(),
  });

export type AutosaveBody = {
  actions: GameAction[];
  farmId: number;
  sender: string;
  signature: string;
};

/**
 * Handler which processes actions and returns the new state of the farm
 */
export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  if (!event.body) {
    throw new Error("No body found in event");
  }

  const body: AutosaveBody = JSON.parse(event.body);
  const valid = schema().validate(body);
  if (valid.error) {
    throw new Error(valid.error.message);
  }

  verifyAccount({
    address: body.sender,
    farmId: body.farmId,
    signature: body.signature,
  });

  const game = await save({
    farmId: body.farmId,
    account: body.sender,
    actions: body.actions,
  });

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      farm: game,
    }),
  };
};
