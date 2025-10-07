// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract OneClickReceiptNFT is ERC721, Ownable {
    uint256 public nextId = 1;
    string public baseURI;
    constructor(string memory _baseURI) ERC721("OneClick Receipt", "OCRT") Ownable(msg.sender) {
        baseURI = _baseURI;
    }
    function _baseURI() internal view override returns (string memory) { return baseURI; }
    function setBaseURI(string calldata _u) external onlyOwner { baseURI = _u; }
    function mintTo(address to) external onlyOwner returns (uint256 tokenId) {
        tokenId = nextId++;
        _safeMint(to, tokenId);
    }
}
