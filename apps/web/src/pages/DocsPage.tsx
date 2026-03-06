import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import {
  BookOpen,
  TabletSmartphone,
  Sparkles,
  Users,
  Wrench,
  ChevronRight,
  ChevronDown,
  ArrowRight,
  Shield,
  Info,
  AlertTriangle,
  Lock,
  Search,
  RefreshCw,
} from "lucide-react";

/* -------------------------------------------------------------------
   Collapsible section for troubleshooting items
   ------------------------------------------------------------------- */
const TroubleshootItem: React.FC<{
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}> = ({ title, icon, children, defaultOpen = false }) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <button
      type="button"
      onClick={() => setOpen((o) => !o)}
      className={[
        "group w-full text-left rounded-xl border transition-all duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        open
          ? "border-primary/25 bg-primary/[0.03] dark:bg-primary/[0.06] shadow-sm"
          : "border-border/40 bg-card hover:border-border/70 hover:shadow-sm",
      ].join(" ")}
    >
      <div className="flex items-center gap-3 p-4">
        <div
          className={[
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors duration-200",
            open
              ? "bg-primary/15 text-primary"
              : "bg-muted/60 text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary",
          ].join(" ")}
        >
          {icon}
        </div>
        <span className="flex-1 text-sm font-medium text-foreground">{title}</span>
        <div
          className={[
            "text-muted-foreground transition-transform duration-200",
            open ? "rotate-0" : "-rotate-90",
          ].join(" ")}
        >
          <ChevronDown className="h-4 w-4" />
        </div>
      </div>

      <div
        className={[
          "grid transition-[grid-template-rows] duration-200 ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        ].join(" ")}
      >
        <div className="overflow-hidden">
          <div className="px-4 pb-4 pl-[3.75rem]">{children}</div>
        </div>
      </div>
    </button>
  );
};

/* -------------------------------------------------------------------
   Numbered step component for Kobo setup
   ------------------------------------------------------------------- */
const Step: React.FC<{
  number: number;
  children: React.ReactNode;
}> = ({ number, children }) => (
  <div className="group flex items-start gap-3">
    <div
      className={[
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
        "bg-primary/10 text-primary text-xs font-bold",
        "transition-all duration-200 group-hover:bg-primary group-hover:text-primary-foreground group-hover:scale-110",
        "ring-2 ring-primary/[0.08]",
      ].join(" ")}
    >
      {number}
    </div>
    <p className="text-sm text-foreground/85 pt-0.5 leading-relaxed">{children}</p>
  </div>
);

/* -------------------------------------------------------------------
   Owner note callout
   ------------------------------------------------------------------- */
const OwnerNote: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    className={[
      "relative overflow-hidden rounded-xl p-4 mt-1",
      "bg-gradient-to-br from-primary/[0.06] via-primary/[0.03] to-transparent",
      "dark:from-primary/[0.1] dark:via-primary/[0.05]",
      "border border-primary/15",
    ].join(" ")}
  >
    {/* Decorative corner glow */}
    <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-primary/[0.08] blur-2xl" />

    <div className="relative flex items-start gap-3">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/15 mt-0.5">
        <Shield className="h-3.5 w-3.5 text-primary" />
      </div>
      <div>
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-primary/80">
          Owner note
        </span>
        <p className="mt-1 text-sm text-foreground/80 leading-relaxed">{children}</p>
      </div>
    </div>
  </div>
);

/* -------------------------------------------------------------------
   Bullet list with custom markers
   ------------------------------------------------------------------- */
const BulletItem: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <li className="flex items-start gap-2.5 text-sm text-foreground/85 leading-relaxed">
    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/40" />
    <span>{children}</span>
  </li>
);

/* -------------------------------------------------------------------
   Quick link navigation card
   ------------------------------------------------------------------- */
const NAV_ITEMS = [
  {
    id: "kobo-setup",
    label: "Kobo setup",
    desc: "Sync books to your reader",
    icon: TabletSmartphone,
    color: "text-status-processing",
    bg: "bg-status-processing/10",
  },
  {
    id: "metadata-and-ai",
    label: "Metadata & AI",
    desc: "How book data is found",
    icon: Sparkles,
    color: "text-primary",
    bg: "bg-primary/10",
  },
  {
    id: "accounts-and-roles",
    label: "Accounts & roles",
    desc: "Permissions explained",
    icon: Users,
    color: "text-status-completed",
    bg: "bg-status-completed/10",
  },
  {
    id: "troubleshooting",
    label: "Troubleshooting",
    desc: "Quick fixes",
    icon: Wrench,
    color: "text-status-queued",
    bg: "bg-status-queued/10",
  },
] as const;

/* ===================================================================
   DOCS PAGE
   =================================================================== */
export const DocsPage: React.FC = () => {
  return (
    <div className="max-w-3xl animate-fade-in">
      {/* ---- Page header ---- */}
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 shadow-sm shadow-primary/[0.06]">
            <BookOpen className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Docs</h1>
            <p className="text-sm text-muted-foreground/80">
              Everything you need to know about BookLite
            </p>
          </div>
        </div>

        {/* Warm gradient separator */}
        <div className="mt-5 h-px bg-gradient-to-r from-primary/30 via-border/60 to-transparent" />
      </div>

      {/* ---- Quick navigation grid ---- */}
      <nav
        className="mb-12 grid grid-cols-2 gap-3 sm:grid-cols-4"
        style={{ animationDelay: "80ms", animationFillMode: "both" }}
      >
        {NAV_ITEMS.map((item, i) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            className={[
              "group relative flex flex-col gap-2 rounded-xl border border-border/40 bg-card p-4",
              "transition-all duration-200",
              "hover:-translate-y-0.5 hover:border-border/70 hover:shadow-md hover:shadow-primary/[0.04]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "animate-fade-up",
            ].join(" ")}
            style={{
              animationDelay: `${i * 60 + 100}ms`,
              animationFillMode: "both",
            }}
          >
            <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${item.bg}`}>
              <item.icon className={`h-4 w-4 ${item.color}`} />
            </div>
            <div>
              <span className="text-sm font-semibold text-foreground">{item.label}</span>
              <p className="mt-0.5 text-[12px] text-muted-foreground leading-snug">{item.desc}</p>
            </div>
            <ArrowRight className="absolute right-3 top-4 h-3.5 w-3.5 text-muted-foreground/0 transition-all duration-200 group-hover:text-muted-foreground/60 group-hover:translate-x-0.5" />
          </a>
        ))}
      </nav>

      {/* ---- Sections ---- */}
      <div className="space-y-14">
        {/* ============================================
            KOBO SETUP
            ============================================ */}
        <section id="kobo-setup" className="scroll-mt-20">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-status-processing/10">
              <TabletSmartphone className="h-4 w-4 text-status-processing" />
            </div>
            <h2 className="text-xl font-semibold tracking-tight">Kobo setup</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-6 max-w-lg">
            Connect your Kobo e-reader and keep your books and reading progress synced.
          </p>

          {/* Numbered steps */}
          <div className="space-y-4 mb-6">
            <Step number={1}>
              Open{" "}
              <Link
                to="/kobo"
                className="font-medium text-primary hover:underline underline-offset-2"
              >
                Kobo
              </Link>{" "}
              in the menu.
            </Step>
            <Step number={2}>Enable sync.</Step>
            <Step number={3}>Choose one or more collections to sync.</Step>
            <Step number={4}>Copy the API endpoint line from the Kobo page.</Step>
            <Step number={5}>Paste it into your Kobo configuration.</Step>
            <Step number={6}>Sync from your device.</Step>
          </div>

          {/* Notes */}
          <div className="rounded-xl border border-border/40 bg-muted/20 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Info className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Good to know
              </span>
            </div>
            <ul className="space-y-2">
              <BulletItem>Only EPUB books sync to Kobo.</BulletItem>
              <BulletItem>Only books inside selected sync collections are included.</BulletItem>
              <BulletItem>
                Regenerating your token immediately invalidates the old token.
              </BulletItem>
            </ul>
          </div>
        </section>

        {/* ============================================
            METADATA AND AI
            ============================================ */}
        <section id="metadata-and-ai" className="scroll-mt-20">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <h2 className="text-xl font-semibold tracking-tight">Metadata and AI</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-6 max-w-lg">
            How metadata is found for your books and when AI is used.
          </p>

          <div className="space-y-5">
            {/* Feature bullets with icons */}
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                {
                  icon: RefreshCw,
                  text: "When uploading files, BookLite runs metadata preview automatically.",
                },
                {
                  icon: Info,
                  text: "Source labels in upload cards show where metadata came from.",
                },
                {
                  icon: Shield,
                  text: "Manual edits you make in upload/review fields are preserved.",
                },
                {
                  icon: Search,
                  text: (
                    <>
                      Each book supports{" "}
                      <span className="font-medium text-foreground">Fetch metadata</span> for a
                      single refresh.
                    </>
                  ),
                },
              ].map((item, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 rounded-lg border border-border/30 bg-card/60 p-3.5 transition-colors duration-200 hover:border-border/50"
                >
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted/60 mt-0.5">
                    <item.icon className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-foreground/85 leading-relaxed">{item.text}</p>
                </div>
              ))}
            </div>

            <div className="flex items-start gap-3 rounded-lg border border-border/30 bg-card/60 p-3.5">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted/60 mt-0.5">
                <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <p className="text-sm text-foreground/85 leading-relaxed">
                Library toolbar supports{" "}
                <span className="font-medium text-foreground">Refresh all metadata</span> for a
                full-library pass.
              </p>
            </div>

            <OwnerNote>
              Owners can enable/disable metadata providers in Administration &gt; System Settings.
              AI-assisted metadata resolution is optional and only applies when OpenRouter settings
              are enabled in instance configuration.
            </OwnerNote>
          </div>
        </section>

        {/* ============================================
            ACCOUNTS AND ROLES
            ============================================ */}
        <section id="accounts-and-roles" className="scroll-mt-20">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-status-completed/10">
              <Users className="h-4 w-4 text-status-completed" />
            </div>
            <h2 className="text-xl font-semibold tracking-tight">Accounts and roles</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-6 max-w-lg">
            Member and owner permissions at a glance.
          </p>

          {/* Role comparison cards */}
          <div className="grid gap-3 sm:grid-cols-2 mb-5">
            <div className="rounded-xl border border-border/40 bg-card p-5">
              <div className="flex items-center gap-2 mb-3">
                <Badge variant="secondary" className="text-[10px] font-semibold">
                  Member
                </Badge>
              </div>
              <ul className="space-y-2">
                <BulletItem>Library, Collections, Uploads</BulletItem>
                <BulletItem>Kobo sync and Profile</BulletItem>
              </ul>
            </div>
            <div className="rounded-xl border border-primary/20 bg-primary/[0.03] dark:bg-primary/[0.06] p-5">
              <div className="flex items-center gap-2 mb-3">
                <Badge variant="default" className="text-[10px] font-semibold">
                  Owner
                </Badge>
              </div>
              <ul className="space-y-2">
                <BulletItem>Everything members can do</BulletItem>
                <BulletItem>Administration panel access</BulletItem>
                <BulletItem>Create users, change roles, manage settings</BulletItem>
                <BulletItem>Enable/disable accounts</BulletItem>
              </ul>
            </div>
          </div>

          <div className="rounded-xl border border-border/40 bg-muted/20 p-3.5 flex items-start gap-2.5 mb-5">
            <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <p className="text-sm text-foreground/80">Disabled users cannot log in.</p>
          </div>

          <OwnerNote>
            Keep at least one active owner account so administration access is never lost.
          </OwnerNote>
        </section>

        {/* ============================================
            TROUBLESHOOTING
            ============================================ */}
        <section id="troubleshooting" className="scroll-mt-20">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-status-queued/10">
              <Wrench className="h-4 w-4 text-status-queued" />
            </div>
            <h2 className="text-xl font-semibold tracking-tight">Troubleshooting</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-6 max-w-lg">
            Quick fixes for common issues.
          </p>

          <div className="space-y-3">
            <TroubleshootItem
              title="No books on Kobo"
              icon={<TabletSmartphone className="h-4 w-4" />}
              defaultOpen
            >
              <ul className="space-y-2">
                <BulletItem>Check Kobo sync is enabled.</BulletItem>
                <BulletItem>Make sure at least one sync collection is selected.</BulletItem>
                <BulletItem>Only EPUB files are synced.</BulletItem>
                <BulletItem>
                  If token was regenerated, update Kobo config with the new endpoint.
                </BulletItem>
              </ul>
            </TroubleshootItem>

            <TroubleshootItem
              title="Metadata missing or wrong"
              icon={<AlertTriangle className="h-4 w-4" />}
            >
              <ul className="space-y-2">
                <BulletItem>
                  Edit metadata manually from upload review or Library details.
                </BulletItem>
                <BulletItem>
                  Use Fetch metadata per book to retry with current providers.
                </BulletItem>
                <BulletItem>Owners can adjust enabled providers in Administration.</BulletItem>
              </ul>
            </TroubleshootItem>

            <TroubleshootItem title="Cannot log in" icon={<Lock className="h-4 w-4" />}>
              <ul className="space-y-2">
                <BulletItem>Confirm username/email and password.</BulletItem>
                <BulletItem>
                  Ask an owner to verify your account is not disabled.
                </BulletItem>
              </ul>
            </TroubleshootItem>
          </div>
        </section>
      </div>

      {/* Bottom spacer */}
      <div className="h-16" />
    </div>
  );
};
