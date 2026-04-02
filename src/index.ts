import express from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { meta, MetaAPIError } from "./meta-client.js";

// ─── Tool definitions ────────────────────────────────────────────────────────

const TOOLS: Tool[] = [
  {
    name: "get_ad_accounts",
    description: "List all Meta ad accounts accessible with the current access token.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_account_info",
    description: "Get detailed info for a specific Meta ad account (spend, balance, status, currency).",
    inputSchema: {
      type: "object",
      required: ["account_id"],
      properties: {
        account_id: { type: "string", description: "Ad account ID (without act_ prefix)" },
      },
    },
  },
  {
    name: "get_campaigns",
    description: "List campaigns for a Meta ad account. Can filter by status.",
    inputSchema: {
      type: "object",
      required: ["account_id"],
      properties: {
        account_id: { type: "string", description: "Ad account ID (without act_ prefix)" },
        status: {
          type: "string",
          enum: ["ACTIVE", "PAUSED", "DELETED", "ARCHIVED"],
          description: "Filter by campaign status (optional)",
        },
      },
    },
  },
  {
    name: "get_campaign",
    description: "Get details for a single campaign by its ID.",
    inputSchema: {
      type: "object",
      required: ["campaign_id"],
      properties: {
        campaign_id: { type: "string", description: "Campaign ID" },
      },
    },
  },
  {
    name: "create_campaign",
    description: "Create a new campaign in a Meta ad account.",
    inputSchema: {
      type: "object",
      required: ["account_id", "name", "objective", "status"],
      properties: {
        account_id: { type: "string", description: "Ad account ID (without act_ prefix)" },
        name: { type: "string", description: "Campaign name" },
        objective: {
          type: "string",
          description: "Campaign objective",
          enum: [
            "OUTCOME_AWARENESS", "OUTCOME_TRAFFIC", "OUTCOME_ENGAGEMENT",
            "OUTCOME_LEADS", "OUTCOME_APP_PROMOTION", "OUTCOME_SALES",
          ],
        },
        status: {
          type: "string",
          enum: ["ACTIVE", "PAUSED"],
          description: "Initial campaign status",
        },
        daily_budget: {
          type: "number",
          description: "Daily budget in account currency cents (e.g. 1000 = $10.00)",
        },
        lifetime_budget: {
          type: "number",
          description: "Lifetime budget in account currency cents",
        },
        start_time: { type: "string", description: "Start time in ISO 8601 format" },
        stop_time: { type: "string", description: "Stop time in ISO 8601 format" },
      },
    },
  },
  {
    name: "update_campaign",
    description: "Update a campaign's name, status, or budget.",
    inputSchema: {
      type: "object",
      required: ["campaign_id"],
      properties: {
        campaign_id: { type: "string", description: "Campaign ID" },
        name: { type: "string", description: "New campaign name" },
        status: {
          type: "string",
          enum: ["ACTIVE", "PAUSED", "DELETED", "ARCHIVED"],
          description: "New status",
        },
        daily_budget: { type: "number", description: "New daily budget in cents" },
        lifetime_budget: { type: "number", description: "New lifetime budget in cents" },
      },
    },
  },
  {
    name: "delete_campaign",
    description: "Delete a campaign permanently.",
    inputSchema: {
      type: "object",
      required: ["campaign_id"],
      properties: {
        campaign_id: { type: "string", description: "Campaign ID to delete" },
      },
    },
  },
  {
    name: "get_adsets",
    description: "List ad sets for a Meta ad account or specific campaign.",
    inputSchema: {
      type: "object",
      required: ["account_id"],
      properties: {
        account_id: { type: "string", description: "Ad account ID (without act_ prefix)" },
        campaign_id: { type: "string", description: "Filter by campaign ID (optional)" },
      },
    },
  },
  {
    name: "get_adset",
    description: "Get details for a single ad set by its ID.",
    inputSchema: {
      type: "object",
      required: ["adset_id"],
      properties: {
        adset_id: { type: "string", description: "Ad set ID" },
      },
    },
  },
  {
    name: "create_adset",
    description: "Create a new ad set inside a campaign.",
    inputSchema: {
      type: "object",
      required: ["account_id", "campaign_id", "name", "status", "optimization_goal", "billing_event", "daily_budget"],
      properties: {
        account_id: { type: "string", description: "Ad account ID (without act_ prefix)" },
        campaign_id: { type: "string", description: "Parent campaign ID" },
        name: { type: "string", description: "Ad set name" },
        status: { type: "string", enum: ["ACTIVE", "PAUSED"] },
        optimization_goal: {
          type: "string",
          description: "Optimization goal e.g. REACH, LINK_CLICKS, CONVERSIONS, LANDING_PAGE_VIEWS",
        },
        billing_event: {
          type: "string",
          description: "Billing event e.g. IMPRESSIONS, LINK_CLICKS",
        },
        daily_budget: { type: "number", description: "Daily budget in cents" },
        bid_amount: { type: "number", description: "Bid amount in cents (optional)" },
        targeting: {
          type: "object",
          description: "Targeting spec object (geo_locations, age_min, age_max, interests, etc.)",
        },
        start_time: { type: "string", description: "Start time ISO 8601" },
        end_time: { type: "string", description: "End time ISO 8601" },
      },
    },
  },
  {
    name: "update_adset",
    description: "Update an ad set's name, status, budget, or targeting.",
    inputSchema: {
      type: "object",
      required: ["adset_id"],
      properties: {
        adset_id: { type: "string", description: "Ad set ID" },
        name: { type: "string" },
        status: { type: "string", enum: ["ACTIVE", "PAUSED", "DELETED", "ARCHIVED"] },
        daily_budget: { type: "number", description: "New daily budget in cents" },
        bid_amount: { type: "number", description: "New bid amount in cents" },
      },
    },
  },
  {
    name: "get_ads",
    description: "List ads for a Meta ad account, optionally filtered by ad set.",
    inputSchema: {
      type: "object",
      required: ["account_id"],
      properties: {
        account_id: { type: "string", description: "Ad account ID (without act_ prefix)" },
        adset_id: { type: "string", description: "Filter by ad set ID (optional)" },
      },
    },
  },
  {
    name: "get_ad",
    description: "Get details for a single ad by its ID.",
    inputSchema: {
      type: "object",
      required: ["ad_id"],
      properties: {
        ad_id: { type: "string", description: "Ad ID" },
      },
    },
  },
  {
    name: "update_ad",
    description: "Update an ad's name or status.",
    inputSchema: {
      type: "object",
      required: ["ad_id"],
      properties: {
        ad_id: { type: "string", description: "Ad ID" },
        name: { type: "string", description: "New ad name" },
        status: { type: "string", enum: ["ACTIVE", "PAUSED", "DELETED", "ARCHIVED"] },
      },
    },
  },
  {
    name: "get_insights",
    description:
      "Get performance insights (impressions, clicks, spend, CTR, CPC, ROAS, conversions) for an account, campaign, ad set, or ad using a date preset.",
    inputSchema: {
      type: "object",
      required: ["object_id", "level", "date_preset"],
      properties: {
        object_id: { type: "string", description: "Account ID (with act_ prefix), campaign ID, ad set ID, or ad ID" },
        level: {
          type: "string",
          enum: ["account", "campaign", "adset", "ad"],
          description: "Breakdown level",
        },
        date_preset: {
          type: "string",
          enum: [
            "today", "yesterday", "this_month", "last_month",
            "last_7d", "last_14d", "last_28d", "last_30d",
            "last_90d", "this_quarter", "last_quarter", "this_year",
          ],
          description: "Date range preset",
        },
      },
    },
  },
  {
    name: "get_insights_by_date_range",
    description: "Get performance insights for a custom date range.",
    inputSchema: {
      type: "object",
      required: ["object_id", "level", "since", "until"],
      properties: {
        object_id: { type: "string", description: "Account ID (with act_ prefix), campaign ID, ad set ID, or ad ID" },
        level: {
          type: "string",
          enum: ["account", "campaign", "adset", "ad"],
        },
        since: { type: "string", description: "Start date YYYY-MM-DD" },
        until: { type: "string", description: "End date YYYY-MM-DD" },
      },
    },
  },
  {
    name: "get_ad_creatives",
    description: "List ad creatives in a Meta ad account.",
    inputSchema: {
      type: "object",
      required: ["account_id"],
      properties: {
        account_id: { type: "string", description: "Ad account ID (without act_ prefix)" },
      },
    },
  },
];

// ─── Tool handler ─────────────────────────────────────────────────────────────

type Args = Record<string, unknown>;

async function handleTool(name: string, args: Args): Promise<unknown> {
  switch (name) {
    case "get_ad_accounts":
      return meta.getAdAccounts();

    case "get_account_info":
      return meta.getAccountInfo(args.account_id as string);

    case "get_campaigns":
      return meta.getCampaigns(
        args.account_id as string,
        undefined,
        args.status as string | undefined
      );

    case "get_campaign":
      return meta.getCampaign(args.campaign_id as string);

    case "create_campaign":
      return meta.createCampaign(
        args.account_id as string,
        args.name as string,
        args.objective as string,
        args.status as string,
        args.daily_budget as number | undefined,
        args.lifetime_budget as number | undefined,
        args.start_time as string | undefined,
        args.stop_time as string | undefined
      );

    case "update_campaign": {
      const { campaign_id, ...updates } = args;
      const mapped: Record<string, unknown> = {};
      if (updates.name) mapped.name = updates.name;
      if (updates.status) mapped.status = updates.status;
      if (updates.daily_budget) mapped.daily_budget = String(updates.daily_budget);
      if (updates.lifetime_budget) mapped.lifetime_budget = String(updates.lifetime_budget);
      return meta.updateCampaign(campaign_id as string, mapped);
    }

    case "delete_campaign":
      return meta.deleteCampaign(args.campaign_id as string);

    case "get_adsets":
      return meta.getAdSets(
        args.account_id as string,
        undefined,
        args.campaign_id as string | undefined
      );

    case "get_adset":
      return meta.getAdSet(args.adset_id as string);

    case "create_adset": {
      const { account_id, ...body } = args;
      if (body.daily_budget) body.daily_budget = String(body.daily_budget);
      if (body.bid_amount) body.bid_amount = String(body.bid_amount);
      return meta.createAdSet(account_id as string, body as Record<string, unknown>);
    }

    case "update_adset": {
      const { adset_id, ...updates } = args;
      const mapped: Record<string, unknown> = {};
      if (updates.name) mapped.name = updates.name;
      if (updates.status) mapped.status = updates.status;
      if (updates.daily_budget) mapped.daily_budget = String(updates.daily_budget);
      if (updates.bid_amount) mapped.bid_amount = String(updates.bid_amount);
      return meta.updateAdSet(adset_id as string, mapped);
    }

    case "get_ads":
      return meta.getAds(
        args.account_id as string,
        undefined,
        args.adset_id as string | undefined
      );

    case "get_ad":
      return meta.getAd(args.ad_id as string);

    case "update_ad": {
      const { ad_id, ...updates } = args;
      return meta.updateAd(ad_id as string, updates);
    }

    case "get_insights":
      return meta.getInsights(
        args.object_id as string,
        args.level as "account" | "campaign" | "adset" | "ad",
        args.date_preset as string
      );

    case "get_insights_by_date_range":
      return meta.getInsightsByDateRange(
        args.object_id as string,
        args.level as "account" | "campaign" | "adset" | "ad",
        args.since as string,
        args.until as string
      );

    case "get_ad_creatives":
      return meta.getAdCreatives(args.account_id as string);

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ─── MCP Server factory ───────────────────────────────────────────────────────

function createMCPServer() {
  const server = new Server(
    { name: "meta-ads-mcp", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args = {} } = req.params;
    try {
      const result = await handleTool(name, args as Args);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      const message = err instanceof MetaAPIError
        ? `Meta API Error: ${err.message}${err.code ? ` (code ${err.code})` : ""}`
        : err instanceof Error
        ? err.message
        : "Unknown error";
      return {
        content: [{ type: "text", text: message }],
        isError: true,
      };
    }
  });

  return server;
}

// ─── Express server ───────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

// Store active SSE transports by session ID
const transports = new Map<string, SSEServerTransport>();

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "meta-ads-mcp" });
});

// SSE endpoint — Claude.ai connects here
app.get("/sse", async (req, res) => {
  console.log("New SSE connection from", req.ip);

  const transport = new SSEServerTransport("/messages", res);
  transports.set(transport.sessionId, transport);

  res.on("close", () => {
    console.log("SSE connection closed:", transport.sessionId);
    transports.delete(transport.sessionId);
  });

  const server = createMCPServer();
  await server.connect(transport);
});

// Message endpoint — Claude.ai posts tool calls here
app.post("/messages", async (req, res) => {
  const sessionId = req.query.sessionId as string;
  const transport = transports.get(sessionId);

  if (!transport) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  await transport.handlePostMessage(req, res);
});

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => {
  console.log(`Meta Ads MCP server running on port ${PORT}`);
  console.log(`  SSE endpoint: http://localhost:${PORT}/sse`);
  console.log(`  Health check: http://localhost:${PORT}/health`);

  if (!process.env.META_ACCESS_TOKEN) {
    console.warn("WARNING: META_ACCESS_TOKEN is not set!");
  }
});
