const META_BASE_URL = "https://graph.facebook.com/v21.0";

export class MetaAPIError extends Error {
  constructor(
    message: string,
    public code?: number,
    public type?: string
  ) {
    super(message);
    this.name = "MetaAPIError";
  }
}

async function callAPI(
  path: string,
  method: "GET" | "POST" | "DELETE" = "GET",
  params: Record<string, string | number | boolean> = {},
  body?: Record<string, unknown>
) {
  const accessToken = process.env.META_ACCESS_TOKEN;
  if (!accessToken) throw new MetaAPIError("META_ACCESS_TOKEN is not set");

  const url = new URL(`${META_BASE_URL}${path}`);
  url.searchParams.set("access_token", accessToken);

  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }

  const options: RequestInit = { method };
  if (body && method !== "GET") {
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify({ ...body, access_token: accessToken });
  }

  const res = await fetch(url.toString(), options);
  const data = (await res.json()) as Record<string, unknown>;

  if (data.error) {
    const err = data.error as Record<string, unknown>;
    throw new MetaAPIError(
      String(err.message),
      Number(err.code),
      String(err.type)
    );
  }
  return data;
}

export const meta = {
  // Account
  async getAdAccounts(fields = "id,name,account_status,currency,timezone_name,amount_spent,balance") {
    return callAPI("/me/adaccounts", "GET", { fields, limit: "50" });
  },

  async getAccountInfo(accountId: string, fields = "id,name,account_status,currency,timezone_name,amount_spent,balance,spend_cap") {
    return callAPI(`/act_${accountId}`, "GET", { fields });
  },

  // Campaigns
  async getCampaigns(
    accountId: string,
    fields = "id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time,buying_type",
    status?: string
  ) {
    const params: Record<string, string> = { fields, limit: "100" };
    if (status) params.effective_status = JSON.stringify([status]);
    return callAPI(`/act_${accountId}/campaigns`, "GET", params);
  },

  async getCampaign(campaignId: string, fields = "id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time,buying_type,budget_remaining") {
    return callAPI(`/${campaignId}`, "GET", { fields });
  },

  async createCampaign(
    accountId: string,
    name: string,
    objective: string,
    status: string,
    dailyBudget?: number,
    lifetimeBudget?: number,
    startTime?: string,
    stopTime?: string
  ) {
    const body: Record<string, unknown> = { name, objective, status };
    if (dailyBudget) body.daily_budget = String(dailyBudget);
    if (lifetimeBudget) body.lifetime_budget = String(lifetimeBudget);
    if (startTime) body.start_time = startTime;
    if (stopTime) body.stop_time = stopTime;
    return callAPI(`/act_${accountId}/campaigns`, "POST", {}, body);
  },

  async updateCampaign(campaignId: string, updates: Record<string, unknown>) {
    return callAPI(`/${campaignId}`, "POST", {}, updates);
  },

  async deleteCampaign(campaignId: string) {
    return callAPI(`/${campaignId}`, "DELETE");
  },

  // Ad Sets
  async getAdSets(
    accountId: string,
    fields = "id,name,status,campaign_id,daily_budget,lifetime_budget,targeting,optimization_goal,billing_event,bid_amount,start_time,end_time",
    campaignId?: string
  ) {
    const params: Record<string, string> = { fields, limit: "100" };
    if (campaignId) params.campaign_id = campaignId;
    return callAPI(`/act_${accountId}/adsets`, "GET", params);
  },

  async getAdSet(adSetId: string, fields = "id,name,status,campaign_id,daily_budget,lifetime_budget,targeting,optimization_goal,billing_event,bid_amount,start_time,end_time") {
    return callAPI(`/${adSetId}`, "GET", { fields });
  },

  async createAdSet(
    accountId: string,
    body: Record<string, unknown>
  ) {
    return callAPI(`/act_${accountId}/adsets`, "POST", {}, body);
  },

  async updateAdSet(adSetId: string, updates: Record<string, unknown>) {
    return callAPI(`/${adSetId}`, "POST", {}, updates);
  },

  // Ads
  async getAds(
    accountId: string,
    fields = "id,name,status,adset_id,campaign_id,creative,created_time,updated_time",
    adSetId?: string
  ) {
    const params: Record<string, string> = { fields, limit: "100" };
    if (adSetId) params.adset_id = adSetId;
    return callAPI(`/act_${accountId}/ads`, "GET", params);
  },

  async getAd(adId: string, fields = "id,name,status,adset_id,campaign_id,creative,created_time,updated_time") {
    return callAPI(`/${adId}`, "GET", { fields });
  },

  async updateAd(adId: string, updates: Record<string, unknown>) {
    return callAPI(`/${adId}`, "POST", {}, updates);
  },

  // Insights
  async getInsights(
    objectId: string,
    level: "account" | "campaign" | "adset" | "ad",
    datePreset: string,
    fields = "impressions,clicks,spend,ctr,cpc,cpm,reach,frequency,actions,action_values,roas"
  ) {
    return callAPI(`/${objectId}/insights`, "GET", {
      level,
      date_preset: datePreset,
      fields,
    });
  },

  async getInsightsByDateRange(
    objectId: string,
    level: "account" | "campaign" | "adset" | "ad",
    since: string,
    until: string,
    fields = "impressions,clicks,spend,ctr,cpc,cpm,reach,frequency,actions,action_values"
  ) {
    return callAPI(`/${objectId}/insights`, "GET", {
      level,
      time_range: JSON.stringify({ since, until }),
      fields,
    });
  },

  // Ad Creatives
  async getAdCreatives(accountId: string, fields = "id,name,title,body,image_url,thumbnail_url,object_url") {
    return callAPI(`/act_${accountId}/adcreatives`, "GET", { fields, limit: "50" });
  },
};
