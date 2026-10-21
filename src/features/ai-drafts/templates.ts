import { DraftTone, TemplateContext, TouchpointType } from "./types";

interface TemplateDefinition {
  subject: (ctx: TemplateContext) => string;
  body: (ctx: TemplateContext) => string;
}

const TEMPLATES: Record<
  TouchpointType,
  Record<DraftTone, TemplateDefinition>
> = {
  FIRST_TOUCH: {
    FRIENDLY: {
      subject: (ctx) =>
        ctx.companyName
          ? `Quick idea for ${ctx.companyName}`
          : `Quick question for you, ${ctx.firstName}`,
      body: (ctx) => {
        const company = ctx.companyName || "your team";
        const sender = ctx.senderName || "the team";
        const agency = ctx.senderAgencyName || "our agency";
        return `Hi ${ctx.firstName},\n\nI was reviewing ${company} recently and noticed a few opportunities to help boost your online conversions and inbound lead capture.\n\nAt ${agency}, we specialize in helping businesses like yours turn missed web visitors into booked clients.\n\nDo you have 10 minutes next Tuesday or Wednesday for a quick brainstorm? No pressure at all—just sharing a few high-impact ideas.\n\nBest regards,\n${sender}`;
      },
    },
    PROFESSIONAL: {
      subject: (ctx) =>
        ctx.companyName
          ? `Growth & digital performance evaluation for ${ctx.companyName}`
          : `Digital performance evaluation for ${ctx.firstName}`,
      body: (ctx) => {
        const company = ctx.companyName || "your organization";
        const sender = ctx.senderName || "Account Director";
        const agency = ctx.senderAgencyName || "our agency";
        return `Dear ${ctx.firstName},\n\nI am contacting you from ${agency}. We conducted a preliminary digital analysis of ${company} and identified critical areas where improved user journeys and conversion workflows could substantially increase your client acquisition rates.\n\nWe would welcome the opportunity to present a high-level summary of these findings and discuss how they align with your quarterly performance targets.\n\nPlease let me know if you are open to a brief introductory call this week.\n\nSincerely,\n${sender}`;
      },
    },
    URGENT: {
      subject: (ctx) =>
        ctx.companyName
          ? `Urgent: Missed conversion opportunities on ${ctx.companyName}`
          : `Time-sensitive note for ${ctx.firstName}`,
      body: (ctx) => {
        const company = ctx.companyName || "your website";
        const sender = ctx.senderName || "the team";
        return `Hi ${ctx.firstName},\n\nI wanted to reach out directly regarding ${company}. Several prospective customers appear to be dropping off before completing an inquiry, which is resulting in missed pipeline opportunities each week.\n\nWe have open implementation availability this month to resolve these bottlenecks quickly.\n\nCan we connect for 10 minutes tomorrow to review the exact friction points?\n\nBest,\n${sender}`;
      },
    },
  },

  POST_DISCOVERY: {
    FRIENDLY: {
      subject: (ctx) => `Great speaking today, ${ctx.firstName}!`,
      body: (ctx) => {
        const sender = ctx.senderName || "the team";
        const notesContext = ctx.notes
          ? `\n\nBased on what we discussed:\n"${ctx.notes.slice(0, 200)}"\n`
          : "";
        return `Hi ${ctx.firstName},\n\nThank you for taking the time to speak with me today! It was fantastic learning more about your current goals and priorities.${notesContext}\nI am putting together a clear overview and proposal outlining the exact steps we can take to achieve these targets.\n\nI will send that over within the next 48 hours. In the meantime, let me know if any other questions pop up!\n\nBest regards,\n${sender}`;
      },
    },
    PROFESSIONAL: {
      subject: (ctx) =>
        ctx.companyName
          ? `Discovery recap & action plan - ${ctx.companyName}`
          : `Discovery session recap & next steps`,
      body: (ctx) => {
        const sender = ctx.senderName || "Account Director";
        const company = ctx.companyName || "your company";
        const notesContext = ctx.notes
          ? `\n\nKey discussion recap:\n${ctx.notes.slice(0, 300)}\n`
          : "";
        return `Dear ${ctx.firstName},\n\nThank you for your time during our discovery call regarding ${company}.${notesContext}\nOur team is currently preparing a tailored scope of work and implementation timeline designed to deliver measurable results on these core requirements.\n\nWe anticipate delivering the comprehensive proposal by end-of-week for your review.\n\nSincerely,\n${sender}`;
      },
    },
    URGENT: {
      subject: (ctx) =>
        `Action items from our discovery call - ${ctx.companyName || ctx.firstName}`,
      body: (ctx) => {
        const sender = ctx.senderName || "the team";
        return `Hi ${ctx.firstName},\n\nFollowing our discussion today, I want to ensure we maintain momentum so we can hit your target launch window without delay.\n\nCould you send over the remaining brand assets and access details by tomorrow so we can finalize the proposal immediately?\n\nLooking forward to getting this started,\n${sender}`;
      },
    },
  },

  PROPOSAL_CHECK_IN: {
    FRIENDLY: {
      subject: (ctx) => `Checking in on the proposal, ${ctx.firstName}`,
      body: (ctx) => {
        const sender = ctx.senderName || "the team";
        const company = ctx.companyName || "your business";
        return `Hi ${ctx.firstName},\n\nJust checking in to see if you had a chance to review the proposal we sent over for ${company}.\n\nI know how busy things get, so if you'd like to hop on a quick call to walk through any questions or adjust scope, I'm happy to do so.\n\nLet me know what works best for your schedule!\n\nBest,\n${sender}`;
      },
    },
    PROFESSIONAL: {
      subject: (ctx) =>
        ctx.companyName
          ? `Proposal status & scope review - ${ctx.companyName}`
          : `Proposal status & executive review`,
      body: (ctx) => {
        const sender = ctx.senderName || "Account Director";
        const company = ctx.companyName || "your team";
        return `Dear ${ctx.firstName},\n\nI am writing to follow up regarding the project proposal submitted for ${company}.\n\nHave you or your leadership team had the opportunity to evaluate the proposed scope and investment terms? We are available to address any questions, clarify deliverables, or provide further architectural details as required.\n\nWe look forward to your feedback.\n\nSincerely,\n${sender}`;
      },
    },
    URGENT: {
      subject: (ctx) =>
        ctx.companyName
          ? `Holding schedule availability for ${ctx.companyName}`
          : `Securing onboarding schedule for your project`,
      body: (ctx) => {
        const sender = ctx.senderName || "the team";
        const company = ctx.companyName || "your project";
        return `Hi ${ctx.firstName},\n\nI wanted to share a quick update regarding our project queue. We have two onboarding slots remaining this month, and I want to make sure we hold one for ${company} if you are still planning to proceed.\n\nCould you let me know your decision by Friday so we can lock in your delivery timeline?\n\nThank you,\n${sender}`;
      },
    },
  },

  RE_ENGAGEMENT: {
    FRIENDLY: {
      subject: (ctx) =>
        ctx.companyName
          ? `Reconnecting, ${ctx.firstName} - still thinking about ${ctx.companyName}?`
          : `Reconnecting, ${ctx.firstName}`,
      body: (ctx) => {
        const sender = ctx.senderName || "the team";
        const company = ctx.companyName || "your business";
        return `Hi ${ctx.firstName},\n\nI hope you've been having a great quarter! I know things can get hectic, so I wanted to circle back and see how things are going with ${company}.\n\nAre you still exploring ways to improve your inbound conversions, or has the focus shifted for now?\n\nEither way, no worries at all—just let me know if it makes sense to reconnect!\n\nBest,\n${sender}`;
      },
    },
    PROFESSIONAL: {
      subject: (ctx) =>
        ctx.companyName
          ? `Revisiting ${ctx.companyName} digital initiatives`
          : `Revisiting our previous discussion`,
      body: (ctx) => {
        const sender = ctx.senderName || "Account Director";
        const company = ctx.companyName || "your organization";
        return `Dear ${ctx.firstName},\n\nI am following up on our previous dialogue regarding digital performance initiatives for ${company}.\n\nGiven that priorities frequently shift with new quarters, I wanted to inquire whether improving your conversion pipelines remains an active objective for your team.\n\nIf the timing is more suitable now, I would be pleased to schedule a brief call to re-evaluate your requirements.\n\nSincerely,\n${sender}`;
      },
    },
    URGENT: {
      subject: (ctx) =>
        ctx.companyName
          ? `Closing our file for ${ctx.companyName}?`
          : `Closing out our file, ${ctx.firstName}?`,
      body: (ctx) => {
        const sender = ctx.senderName || "the team";
        const company = ctx.companyName || "your company";
        return `Hi ${ctx.firstName},\n\nI haven't heard back from you regarding ${company}, so I assume this is no longer a priority for you right now.\n\nI'll close out our file so I don't continue cluttering your inbox. If you ever decide to revisit this in the future, feel free to reach out anytime.\n\nWishing you all the best,\n${sender}`;
      },
    },
  },
};

/**
 * Generates an instant, deterministic email draft.
 * Executes in under 1 millisecond with zero external network dependencies.
 */
export function generateDeterministicTemplate(
  touchpointType: TouchpointType,
  tone: DraftTone = "FRIENDLY",
  context: TemplateContext,
): { subject: string; body: string } {
  const handler =
    TEMPLATES[touchpointType]?.[tone] || TEMPLATES.FIRST_TOUCH.FRIENDLY;

  const sanitizedContext: TemplateContext = {
    ...context,
    firstName: context.firstName.trim() || "there",
    companyName: context.companyName ? context.companyName.trim() : null,
    senderAgencyName: context.senderAgencyName
      ? context.senderAgencyName.trim()
      : "LeadRescue",
    senderName: context.senderName ? context.senderName.trim() : "The Team",
  };

  return {
    subject: handler.subject(sanitizedContext),
    body: handler.body(sanitizedContext),
  };
}
