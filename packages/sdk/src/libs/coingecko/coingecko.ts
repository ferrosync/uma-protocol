import axios from "axios";
import assert from "assert";
import { get } from "lodash";

class Coingecko {
  private host: string;
  constructor(host = "https://api.coingecko.com/api/v3") {
    this.host = host;
  }
  // Fetch historic prices for a `contract` denominated in `currency` between timestamp `from` and `to`. Note timestamps
  // are assumed to be js timestamps and are converted to unixtimestamps by dividing by 1000.
  async getHistoricContractPrices(contract: string, from: number, to: number, currency = "usd") {
    assert(contract, "requires contract address");
    assert(currency, "requires currency symbol");
    assert(from, "requires from timestamp");
    assert(to, "requires to timestamp");
    from = Math.floor(from / 1000);
    to = Math.floor(to / 1000);
    const result = await this.call(
      `coins/ethereum/contract/${contract.toLowerCase()}/market_chart/range/?vs_currency=${currency}&from=${from}&to=${to}`
    );
    if (result.prices) return result.prices;
    else throw new Error("Something went wrong fetching coingecko prices!");
  }
  async getContractDetails(contract_address: string, id = "ethereum") {
    return this.call(`coins/${id}/contract/${contract_address.toLowerCase()}`);
  }
  async getCurrentPriceByContract(contract_address: string, currency = "usd") {
    const result = await this.getContractDetails(contract_address);
    const price = get(result, ["market_data", "current_price", currency], null);
    assert(price !== null, "No current price available for: " + contract_address);
    return [result.last_updated, price];
  }
  // Return an array of spot prices for an array of collateral addresses in one async call. Note we might in future
  // This was adapted from packages/merkle-distributor/kpi-options-helpers/calculate-uma-tvl.ts
  async getContractPrices(addresses: Array<string>, currency = "usd") {
    // Generate a unique set with no repeated. join the set with the required coingecko delimiter.
    const contract_addresses = Array.from(new Set(addresses.filter((n) => n).values()));
    assert(contract_addresses.length > 0, "Must supply at least 1 contract address");
    // coingecko returns lowercase addresses, so if you expect checksummed addresses, this lookup table will convert them back without having to add ethers as a dependency
    const lookup = Object.fromEntries(
      contract_addresses.map((address) => {
        return [address.toLowerCase(), address];
      })
    );
    // annoying, but have to type this to iterate over entries
    type Result = {
      [address: string]: {
        usd: number;
        last_updated_at: number;
      };
    };
    const result: Result = await this.call(
      `simple/token_price/ethereum?contract_addresses=${contract_addresses.join(
        "%2C"
      )}&vs_currencies=${currency}&include_last_updated_at=true`
    );
    return Object.entries(result).map(([key, value]) => {
      return { address: lookup[key], timestamp: value.last_updated_at, price: value.usd };
    });
  }
  async call(path: string) {
    try {
      const { host } = this;
      const url = `${host}/${path}`;
      const result = await axios(url);
      return result.data;
    } catch (err) {
      const msg = get(err, "response.data.error", get(err, "response.statusText", "Unknown Coingecko Error"));
      throw new Error(msg);
    }
  }
}
export default Coingecko;
