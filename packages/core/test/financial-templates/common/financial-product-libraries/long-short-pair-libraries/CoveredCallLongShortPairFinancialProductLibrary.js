const { didContractThrow, ZERO_ADDRESS } = require("@uma/common");
const { assert } = require("chai");

// Tested Contract
const CoveredCallLongShortPairFinancialProductLibrary = artifacts.require(
  "CoveredCallLongShortPairFinancialProductLibrary"
);

// helper contracts. To test LSP libraries we simply need a financial contract with an `expirationTimestamp` method.

const ExpiringContractMock = artifacts.require("ExpiringMultiPartyMock");

const { toWei, toBN, utf8ToHex } = web3.utils;
const strikePrice = toWei("400");

contract("CoveredCallLongShortPairFinancialProductLibrary", function () {
  let callOptionLSPFPL;
  let expiringContractMock;

  beforeEach(async () => {
    callOptionLSPFPL = await CoveredCallLongShortPairFinancialProductLibrary.new();
    expiringContractMock = await ExpiringContractMock.new(
      ZERO_ADDRESS, // _financialProductLibraryAddress
      "1000000", // _expirationTimestamp
      { rawValue: toWei("1.5") }, // _collateralRequirement
      utf8ToHex("TEST_IDENTIFIER"), // _priceIdentifier
      ZERO_ADDRESS // _timerAddress
    );
  });
  describe("Long Short Pair Parameterization", () => {
    it("Can set and fetch valid strikes", async () => {
      await callOptionLSPFPL.setLongShortPairParameters(expiringContractMock.address, strikePrice);

      const setStrike = await callOptionLSPFPL.longShortPairStrikePrices(expiringContractMock.address);
      assert.equal(setStrike.toString(), strikePrice);
    });
    it("Can not re-use existing LSP contract address", async () => {
      await callOptionLSPFPL.setLongShortPairParameters(expiringContractMock.address, strikePrice);

      // Second attempt should revert.
      assert(
        await didContractThrow(callOptionLSPFPL.setLongShortPairParameters(expiringContractMock.address, strikePrice))
      );
    });
    it("Can not set invalid LSP contract address", async () => {
      // LSP Address must implement the `expirationTimestamp method.
      assert(await didContractThrow(callOptionLSPFPL.setLongShortPairParameters(ZERO_ADDRESS, strikePrice)));
    });
  });
  describe("Compute expiry tokens for collateral", () => {
    beforeEach(async () => {
      await callOptionLSPFPL.setLongShortPairParameters(expiringContractMock.address, strikePrice);
    });
    it("Lower than strike should return 0", async () => {
      const expiryTokensForCollateral = await callOptionLSPFPL.percentageLongCollateralAtExpiry.call(toWei("300"), {
        from: expiringContractMock.address,
      });
      assert.equal(expiryTokensForCollateral.toString(), toWei("0"));
    });
    it("Higher than strike correct value", async () => {
      const expiryTokensForCollateral = await callOptionLSPFPL.percentageLongCollateralAtExpiry.call(toWei("500"), {
        from: expiringContractMock.address,
      });
      assert.equal(expiryTokensForCollateral.toString(), toWei("0.2"));
    });
    it("Arbitrary expiry price above strike should return correctly", async () => {
      for (const price of [toWei("500"), toWei("600"), toWei("1000"), toWei("1500"), toWei("2000")]) {
        const expiryTokensForCollateral = await callOptionLSPFPL.percentageLongCollateralAtExpiry.call(price, {
          from: expiringContractMock.address,
        });
        const expectedPrice = toBN(price)
          .sub(toBN(strikePrice))
          .mul(toBN(toWei("1")))
          .div(toBN(price));
        assert.equal(expiryTokensForCollateral.toString(), expectedPrice.toString());
      }
    });
    it("Should never return a value greater than 1", async () => {
      // create a massive expiry price. 1e18*1e18. Under all conditions should return less than 1.
      const expiryTokensForCollateral = await callOptionLSPFPL.percentageLongCollateralAtExpiry.call(
        toWei(toWei("1")),
        { from: expiringContractMock.address }
      );
      assert.isTrue(toBN(expiryTokensForCollateral).lt(toBN(toWei("1"))));
    });
  });
});
