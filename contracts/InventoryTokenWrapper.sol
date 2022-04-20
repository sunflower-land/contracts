

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { Wrapped1155, Wrapped1155Factory } from "./WrappedERC1155.sol";
import { GameOwner } from "./GameOwner.sol";
import { SunflowerLandInventory } from "./Inventory.sol";
import { IERC1155 } from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

contract SunflowerLandTokenWrapper is Wrapped1155Factory, GameOwner {
    
    SunflowerLandInventory inventory;

    constructor(SunflowerLandInventory _inventory) payable {
        gameRoles[msg.sender] = true;
        inventory = _inventory;
    }

    function gameDeployWrappedToken(uint256 tokenID, bytes calldata data)
        public
        onlyGame
        returns (Wrapped1155)
    {
        return Wrapped1155(requireWrapped1155(inventory, tokenID, data));
    }

    function balanceOf(address account, uint256 tokenID, bytes calldata data) 
        public 
        view 
        returns (uint256)
    {
        Wrapped1155 wrappedToken = getWrapped1155(inventory, tokenID, data);
        return wrappedToken.balanceOf(account);
    }

    function getWrappedToken(uint256 tokenID, bytes calldata data)
        public
        returns (Wrapped1155)
    {
        return Wrapped1155(getWrapped1155(inventory, tokenID, data));
    }

    function depositWrappedTokensToFarm(
        address farm,
        uint256[] calldata tokenIDs, 
        uint256[] calldata amounts,
        bytes calldata data
    )
        public
        returns (bool)
    {
        batchUnwrap(inventory, tokenIDs, amounts, farm, data);

        return true;
    }

}