const { expect } = require("chai");
const { ethers } = require("hardhat");
const { setBalance } = require("@nomicfoundation/hardhat-network-helpers");


let registry, charity, voting, token, treasury, mockToken, mockOracle;

const decimals = 18//ethers.utils.parseUnits('1', '18');
const amount = ethers.utils.parseUnits('1', decimals);
const price = ethers.utils.parseUnits('2', decimals);

let deployer, user;

async function setup() {
  // Deploy contracts
  let registry = await (await ethers.getContractFactory("GovernanceRegistry")).deploy();
  let charity = await (await ethers.getContractFactory("GovernanceCharity")).deploy(registry.address);

  let mockToken = await (await ethers.getContractFactory("MockERC20")).deploy();
  let voting = await (await ethers.getContractFactory("GovernanceVoting")).deploy("GOV", registry.address, mockToken.address);
  let token = await (await ethers.getContractFactory("GovernanceToken")).deploy(registry.address);
  let tokenRegistry = await(await ethers.getContractFactory("TokenRegistry")).deploy();

  await tokenRegistry.add(mockToken.address);
  await tokenRegistry.add(ethers.constants.AddressZero);

  let treasury = await(await ethers.getContractFactory("GovernanceTreasury")).deploy(registry.address);

  // Deploy mockOracle
  let mockOracle = await (await ethers.getContractFactory("MockOracle")).deploy();
  await mockOracle.setDecimals(decimals);
  await mockOracle.setPrice(price);

  await treasury.setPriceFeed(mockToken.address, mockOracle.address);

  // Set registry addresses
  await registry.init(token.address, charity.address, voting.address, treasury.address, tokenRegistry.address);
  return [registry, charity, voting, token, treasury, mockToken, mockOracle];
}

describe("Contract Tests", function() {
  before(async function() {
    [deployer, user] = await ethers.getSigners();
    [registry, charity, voting, token, treasury, mockToken, mockOracle] = await setup();
  });

  describe("Governance Registry", function() {
    it("Fetch Charity", async function() {
      expect(await registry.governanceCharity()).to.be.equal(charity.address);
    });
    it("Fetch Voter", async function() {
      expect(await registry.governanceVoter()).to.be.equal(voting.address);
    });
    it("Modify Treasury as Owner", async function() {
      let newVoting = await (await ethers.getContractFactory("GovernanceTreasury")).deploy(registry.address);
      await registry.setGovernanceTreasury(newVoting.address);

      expect(await registry.governanceTreasury()).to.be.equal(newVoting.address);

      //Reset for future tests
      await registry.setGovernanceTreasury(treasury.address);
    });
    it("Modify Treasury as User", async function() {
      let newVoting = await (await ethers.getContractFactory("GovernanceTreasury")).deploy(registry.address);
      await expect(registry.connect(user).setGovernanceTreasury(newVoting.address)).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });
  describe("Governance Charity", function() {
    it("Register as a new charity", async function() {
      // Make sure our entry is 0
      expect(await charity.statusOf(user.address)).to.equal(0);
      
      let proof = ethers.utils.randomBytes(10);
      await expect(charity.connect(user).register(proof)).to.emit(charity, "Registered")
      .withArgs(user.address, proof);

      // If we try to register again, we should fail
      await expect(charity.connect(user).register(proof))
      .to.be.revertedWith("Already registered");

      // Make sure our entry has been modified
      expect(await charity.statusOf(user.address)).to.equal(1);
    });
    it("Verify Charity", async function() {
      //If we try to verify as not owner
      await expect(charity.connect(user).verify(user.address))
      .to.be.revertedWith("Ownable: caller is not the owner");

      //Verify user
      await expect(charity.verify(user.address))
      .to.emit(charity, "Verified")
      .withArgs(user.address);

      //Verify address which has not registerd
      await expect(charity.verify(ethers.constants.AddressZero))
      .to.be.revertedWith("Not registered");

      expect(await charity.statusOf(user.address)).to.equal(2);
    });
  });
  describe("Governance Treasury", function() {
    before(async function() {
      //Increase user's balance and mint tokens
      await setBalance(user.address, amount);
      await mockToken.mint(user.address, amount);
      
      expect(await mockToken.balanceOf(user.address)).to.be.equal(amount);
      expect(await ethers.provider.getBalance(user.address)).to.be.equal(amount);
    });
    it("Deposit User Funds with ETH", async function() {
      //Deposit funds
      await treasury.connect(user).deposit(ethers.constants.AddressZero, 0, {value: amount.div(2)});
      expect(await token.balanceOf(user.address)).to.be.equal(amount.div(2));
    });
    it("Deposit User Funds with ERC20", async function() {
      //Get current token balance of user
      let currentBalance = await token.balanceOf(user.address);
      const oneToken = ethers.utils.parseUnits('1', decimals)

      //Approve spending
      await mockToken.connect(user).increaseAllowance(treasury.address, amount);
      await treasury.connect(user).deposit(mockToken.address, amount);

      expect(await token.balanceOf(user.address)).to.be.equal(currentBalance.add(amount.mul(oneToken).div(price)));

      
    });
  });
  describe("Governance Voting", function() {
    it("Start Proposal", async function() {
      let blockNumber = await ethers.provider.getBlockNumber();
      let delay = await voting.votingDelay();
      let period = await voting.votingPeriod();
      let timestamp = (await ethers.provider.getBlock(blockNumber)).timestamp + 10;


      await ethers.provider.send("evm_setNextBlockTimestamp", [timestamp])
      

      // Create a new proposal
      await expect(voting.connect(user).propose("Initial Epoch"))
      .to.emit(voting, "ProposalCreated")
      .withArgs(timestamp, user.address, delay.add(timestamp), delay.add(period.add(timestamp)), "Initial Epoch");
    
      //Create another proposal while the current one is running
      await expect(voting.connect(user).propose("New Epoch"))
      .to.be.revertedWith("Proposal is already running");

    });
  });

  
});
