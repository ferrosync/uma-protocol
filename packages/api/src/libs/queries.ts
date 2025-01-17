import assert from "assert";
// allow for more complex queries, joins and shared queries between services
import type { AppState, CurrencySymbol, PriceSample } from "..";
import * as uma from "@uma/sdk";
import { calcGcr } from "./utils";
import bluebird from "bluebird";
import { BigNumber } from "ethers";

const { exists } = uma.utils;
type Dependencies = Pick<AppState, "erc20s" | "emps" | "stats" | "registeredEmps" | "prices">;

export default (appState: Dependencies) => {
  const { prices } = appState;

  async function historicalPricesByTokenAddress(
    address: string,
    start = 0,
    end: number = Date.now(),
    currency: CurrencySymbol = "usd"
  ): Promise<PriceSample[]> {
    assert(start >= 0, "requires a start value >= 0");
    assert(exists(prices[currency]), "invalid currency type: " + currency);
    assert(exists(prices[currency].history[address]), "no prices for address" + address);
    const results = await prices[currency].history[address].betweenByTimestamp(start, end);
    // convert this to tuple to save bytes.
    return results.map(({ price, timestamp }) => [timestamp, price]);
  }

  async function sliceHistoricalPricesByTokenAddress(
    address: string,
    start = 0,
    length = 1,
    currency: CurrencySymbol = "usd"
  ): Promise<PriceSample[]> {
    assert(start >= 0, "requires a start value >= 0");
    assert(exists(prices[currency]), "invalid currency type: " + currency);
    assert(exists(prices[currency].history[address]), "no prices for address" + address);
    const results = await prices[currency].history[address].sliceByTimestamp(start, length);
    // convert this to tuple to save bytes.
    return results.map(({ price, timestamp }) => [timestamp, price]);
  }
  async function latestPriceByTokenAddress(address: string, currency: CurrencySymbol = "usd") {
    assert(address, "requires an erc20 token address");
    assert(exists(prices[currency]), "invalid currency type: " + currency);
    const priceSample = prices[currency].latest[address];
    assert(exists(priceSample), "No price for address: " + address);
    return priceSample;
  }
  async function getAnyEmp(empAddress: string) {
    if (await appState.emps.active.has(empAddress)) {
      return appState.emps.active.get(empAddress);
    }
    return appState.emps.expired.get(empAddress);
  }
  // joins emp with token state and gcr
  async function getFullEmpState(empState: uma.tables.emps.Data) {
    const token = empState.tokenCurrency ? await appState.erc20s.get(empState.tokenCurrency).catch(() => null) : null;
    const collateral = empState.collateralCurrency
      ? await appState.erc20s.get(empState.collateralCurrency).catch(() => null)
      : null;

    const state = {
      ...empState,
      tokenDecimals: token?.decimals,
      collateralDecimals: collateral?.decimals,
      tokenName: token?.name,
      collateralName: collateral?.name,
    };
    let gcr = "0";
    try {
      gcr = calcGcr(state).toString();
    } catch (err) {
      // nothing
    }
    return {
      ...state,
      gcr,
    };
  }

  async function listActiveEmps() {
    const emps = appState.emps.active.values();
    return bluebird.map(emps, (emp) => getFullEmpState(emp).catch(() => emp));
  }
  async function listExpiredEmps() {
    const emps = appState.emps.expired.values();
    return bluebird.map(emps, (emp) => getFullEmpState(emp).catch(() => emp));
  }

  async function sumTvl(addresses: string[], currency: CurrencySymbol = "usd") {
    const tvl = await bluebird.reduce(
      addresses,
      async (sum, address) => {
        const stats = await appState.stats[currency].latest.getOrCreate(address);
        return sum.add(stats.tvl || "0");
      },
      BigNumber.from("0")
    );
    return tvl.toString();
  }
  async function totalTvl(currency: CurrencySymbol = "usd") {
    const addresses = Array.from(appState.registeredEmps.values());
    return sumTvl(addresses, currency);
  }

  return {
    getFullEmpState,
    getAnyEmp,
    listActiveEmps,
    listExpiredEmps,
    totalTvl,
    sumTvl,
    latestPriceByTokenAddress,
    historicalPricesByTokenAddress,
    sliceHistoricalPricesByTokenAddress,
  };
};
