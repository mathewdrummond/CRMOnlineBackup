export const millbrookDesignTokens = {
  meta: {
    name: "JoinerFlow / Millbrook CRM Design System V1",
    intent: "Premium warm workshop operating system for cabinetry and joinery workflows.",
  },
  colors: {
    foundation: {
      offWhite: "#F8F1E6",
      limestone: "#EADDCB",
      limestoneSoft: "#F2E7D8",
      clay: "#9F6132",
      taupe: "#7E6654",
      walnut: "#442414",
      walnutDeep: "#1E0F08",
      bronze: "#A9783D",
      charcoalBrown: "#261C16",
      mutedSage: "#6F7F61",
      mutedAmber: "#C9974E",
      dustyRed: "#A45F52",
      slateBlue: "#607487",
    },
    surface: {
      canvas: "hsl(38 38% 96%)",
      panel: "hsl(38 36% 98%)",
      raised: "hsl(37 32% 95%)",
      inset: "hsl(35 25% 89%)",
      wash: "hsl(34 23% 86%)",
      inverse: "hsl(25 21% 12%)",
      border: "hsl(32 20% 81%)",
      borderSubtle: "hsl(32 22% 80% / 0.56)",
    },
    text: {
      primary: "hsl(25 26% 15%)",
      secondary: "hsl(27 10% 36%)",
      muted: "hsl(29 9% 48%)",
      inverse: "hsl(38 32% 94%)",
      accent: "hsl(27 48% 42%)",
    },
    status: {
      neutral: { bg: "#E7DED2", fg: "#4F4137", border: "#D5C7B7" },
      info: { bg: "#E3EAF0", fg: "#40586C", border: "#C7D3DD" },
      success: { bg: "#E6ECE0", fg: "#4F6540", border: "#C9D7BE" },
      warning: { bg: "#F2E2C6", fg: "#7A5621", border: "#DFC38E" },
      danger: { bg: "#EEDBD7", fg: "#7E4038", border: "#D7ADA5" },
      accent: { bg: "#EFE0CF", fg: "#794C2E", border: "#D8B48C" },
      locked: { bg: "#DDD6CE", fg: "#514942", border: "#C9BFB5" },
    },
    workflow: {
      needsReview: "warning",
      readyToSend: "success",
      missingCost: "danger",
      safeToPrint: "success",
      warning: "warning",
      archived: "neutral",
      locked: "locked",
      imported: "info",
      autoAdded: "accent",
    },
  },
  typography: {
    heading:
      '"Avenir Next", "Inter", "Segoe UI", "Helvetica Neue", system-ui, sans-serif',
    body:
      '"Avenir Next", "Segoe UI", "Helvetica Neue", system-ui, sans-serif',
    scale: {
      pageTitle: "2rem",
      sectionTitle: "1.25rem",
      cardTitle: "0.95rem",
      body: "0.9375rem",
      helper: "0.8125rem",
      metadata: "0.75rem",
    },
    tracking: {
      eyebrow: "0.18em",
      label: "0.08em",
    },
  },
  spacing: {
    pageX: "clamp(1rem, 2.5vw, 2rem)",
    pageY: "clamp(1.25rem, 2.8vw, 2.5rem)",
    section: "1.5rem",
    card: "1.25rem",
    controlGap: "0.625rem",
  },
  radius: {
    control: "0.75rem",
    card: "1rem",
    panel: "1.25rem",
    editorial: "1.5rem",
  },
  shadow: {
    soft: "0 16px 44px rgba(54, 39, 27, 0.08)",
    raised: "0 20px 58px rgba(54, 39, 27, 0.12)",
    overlay: "0 28px 88px rgba(20, 12, 7, 0.24)",
  },
  touch: {
    minTarget: "44px",
    workshopTarget: "52px",
    rowHeight: "48px",
  },
};

export const reviewStateToneMap = millbrookDesignTokens.colors.workflow;

export default millbrookDesignTokens;
