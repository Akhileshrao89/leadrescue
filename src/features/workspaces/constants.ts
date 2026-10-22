export interface ActiveWorkspaceContext {
  user: {
    id: string;
    email: string;
    fullName?: string;
  };
  workspace: {
    id: string;
    name: string;
    slug: string;
    timezone: string;
  };
  role: "OWNER" | "ADMIN" | "MEMBER";
}

export const DEMO_WORKSPACE_ID = "ws_demo_agency";

export const DEMO_WORKSPACE_CONTEXT: ActiveWorkspaceContext = {
  user: {
    id: "usr_demo_agency_owner",
    email: "owner@apexstudios.example.com",
    fullName: "Alex Vance",
  },
  workspace: {
    id: DEMO_WORKSPACE_ID,
    name: "Apex Web & SEO Studio",
    slug: "apex-studios",
    timezone: "America/New_York",
  },
  role: "OWNER",
};
