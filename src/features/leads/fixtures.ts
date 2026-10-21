import { Lead } from "./types";

export const DEMO_DATA_DISCLAIMER =
  "NOTICE: The leads displayed below are isolated demo fixtures for the frontend shell. Database persistence and live Supabase queries will be activated in Phase 5.";

const now = new Date();
const todayISO = now.toISOString();

const yesterday = new Date(now);
yesterday.setDate(yesterday.getDate() - 1);
const yesterdayISO = yesterday.toISOString();

const threeDaysAgo = new Date(now);
threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
const threeDaysAgoISO = threeDaysAgo.toISOString();

const tomorrow = new Date(now);
tomorrow.setDate(tomorrow.getDate() + 1);
const tomorrowISO = tomorrow.toISOString();

export const MOCK_LEADS: Lead[] = [
  {
    id: "demo-lead-001",
    workspaceId: "demo-workspace-001",
    firstName: "Sarah",
    lastName: "Jenkins",
    email: "sarah@brightpathdental.com",
    phone: "+1 (555) 234-5678",
    companyName: "BrightPath Dental Care",
    website: "https://brightpathdental.com",
    stage: "CONTACTED",
    source: "cold_audit",
    notes:
      "Sent SEO audit showing 404 errors on appointment booking page. High interest in local SEO overhaul.",
    lastContactedAt: threeDaysAgoISO,
    nextFollowUpAt: yesterdayISO, // OVERDUE
    isArchived: false,
    version: 1,
    createdAt: threeDaysAgoISO,
    updatedAt: yesterdayISO,
  },
  {
    id: "demo-lead-002",
    workspaceId: "demo-workspace-001",
    firstName: "Marcus",
    lastName: "Vance",
    email: "marcus@vancehvac.net",
    phone: "+1 (555) 890-1234",
    companyName: "Vance Heating & Cooling",
    website: "https://vancehvac.net",
    stage: "PROPOSAL",
    source: "referral",
    notes:
      "Proposal for $4,500 redesign sent on Monday. Follow up today to review questions on hosting and timeline.",
    lastContactedAt: yesterdayISO,
    nextFollowUpAt: todayISO, // DUE TODAY
    isArchived: false,
    version: 2,
    createdAt: yesterdayISO,
    updatedAt: todayISO,
  },
  {
    id: "demo-lead-003",
    workspaceId: "demo-workspace-001",
    firstName: "Elena",
    lastName: "Rostova",
    email: "elena@elevatefitness.org",
    phone: "+1 (555) 456-7890",
    companyName: "Elevate Boutique Fitness",
    website: "https://elevatefitness.org",
    stage: "QUALIFIED",
    source: "linkedin",
    notes:
      "Looking to replace Wix site with custom responsive Next.js/Tailwind landing pages for class bookings.",
    lastContactedAt: yesterdayISO,
    nextFollowUpAt: todayISO, // DUE TODAY
    isArchived: false,
    version: 1,
    createdAt: yesterdayISO,
    updatedAt: todayISO,
  },
  {
    id: "demo-lead-004",
    workspaceId: "demo-workspace-001",
    firstName: "David",
    lastName: "Kroll",
    email: "david@krollroofing.com",
    phone: "+1 (555) 345-6789",
    companyName: "Kroll Commercial Roofing",
    website: "https://krollroofing.com",
    stage: "NEW",
    source: "csv_import",
    notes:
      "Imported from Q3 construction contractor directory. Needs initial outreach message.",
    lastContactedAt: null,
    nextFollowUpAt: tomorrowISO, // UPCOMING
    isArchived: false,
    version: 1,
    createdAt: todayISO,
    updatedAt: todayISO,
  },
  {
    id: "demo-lead-005",
    workspaceId: "demo-workspace-001",
    firstName: "Rachel",
    lastName: "Green",
    email: "rachel@bloombakery.shop",
    phone: "+1 (555) 678-9012",
    companyName: "Bloom Artisanal Bakery",
    website: "https://bloombakery.shop",
    stage: "WON",
    source: "referral",
    notes:
      "Signed $3,800 e-commerce menu design package. Initial deposit cleared.",
    lastContactedAt: yesterdayISO,
    nextFollowUpAt: null, // CLOSED WON
    isArchived: false,
    version: 3,
    createdAt: threeDaysAgoISO,
    updatedAt: yesterdayISO,
  },
  {
    id: "demo-lead-006",
    workspaceId: "demo-workspace-001",
    firstName: "Tom",
    lastName: "Miller",
    email: "tom@millerplumbing.com",
    phone: "+1 (555) 912-3456",
    companyName: "Miller Plumbing Pros",
    website: null,
    stage: "NEW",
    source: "csv_import",
    notes: "No follow-up date assigned yet.",
    lastContactedAt: null,
    nextFollowUpAt: null, // UNSCHEDULED
    isArchived: false,
    version: 1,
    createdAt: todayISO,
    updatedAt: todayISO,
  },
];
