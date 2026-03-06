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
        "group w-full text-left rounded-2xl border transition-all duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        open
          ? "border-primary/20 bg-primary/[0.02] dark:bg-primary/[0.04] shadow-sm shadow-primary/[0.03]"
          : "border-border/30 bg-card hover:border-border/50 hover:shadow-sm hover:shadow-black/[0.02]",
      ].join(" ")}
    >
      <div className="flex items-center gap-3 px-5 py-4">
        <div
          className={[
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-all duration-200",
            open
              ? "bg-primary/12 text-primary"
              : "bg-muted/30 text-muted-foreground/60 group-hover:bg-primary/8 group-hover:text-primary",
          ].join(" ")}
        >
          {icon}
        </div>
        <span className="flex-1 text-sm font-medium text-foreground">{title}</span>
        <div
          className={[
            "text-muted-foreground/40 transition-transform duration-200",
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
          <div className="px-5 pb-5 pl-16">{children}</div>
        </div>
      </div>
    </button>
  );
};

const Step: React.FC<{
  number: number;
  isLast?: boolean;
  children: React.ReactNode;
}> = ({ number, isLast = false, children }) => (
  <div className="group relative flex items-start gap-3.5">
    {!isLast && (
      <div className="absolute left-[0.8125rem] top-8 bottom-0 w-px bg-border/30" />
    )}
    <div
      className={[
        "relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
        "bg-primary/8 text-primary text-xs font-bold",
        "transition-all duration-200 group-hover:bg-primary group-hover:text-primary-foreground group-hover:scale-110",
        "ring-2 ring-primary/[0.06]",
      ].join(" ")}
    >
      {number}
    </div>
    <p className="text-sm text-foreground/85 pt-0.5 pb-3 leading-relaxed">{children}</p>
  </div>
);

const OwnerNote: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    className={[
      "relative overflow-hidden rounded-2xl p-5 mt-1",
      "bg-gradient-to-br from-primary/[0.05] via-primary/[0.02] to-transparent",
      "dark:from-primary/[0.08] dark:via-primary/[0.04]",
      "border border-primary/12",
    ].join(" ")}
  >
    <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-primary/[0.06] blur-3xl" />
    <div className="relative flex items-start gap-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/12 mt-0.5">
        <Shield className="h-3.5 w-3.5 text-primary" />
      </div>
      <div>
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-primary/70">
          Owner note
        </span>
        <p className="mt-1 text-sm text-foreground/75 leading-relaxed">{children}</p>
      </div>
    </div>
  </div>
);

const BulletItem: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <li className="flex items-start gap-2.5 text-sm text-foreground/80 leading-relaxed">
    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/30" />
    <span>{children}</span>
  </li>
);

const NAV_ITEMS = [
  { id: "kobo-setup", label: "Kobo setup", desc: "Sync books to your reader", icon: TabletSmartphone, color: "text-status-processing", bg: "bg-status-processing/8" },
  { id: "metadata-and-ai", label: "Metadata & AI", desc: "How book data is found", icon: Sparkles, color: "text-primary", bg: "bg-primary/8" },
  { id: "accounts-and-roles", label: "Accounts & roles", desc: "Permissions explained", icon: Users, color: "text-status-completed", bg: "bg-status-completed/8" },
  { id: "troubleshooting", label: "Troubleshooting", desc: "Quick fixes", icon: Wrench, color: "text-status-queued", bg: "bg-status-queued/8" },
] as const;

export const DocsPage: React.FC = () => {
  return (
    <div className="max-w-3xl animate-fade-in">
      <div className="mb-12">
        <div className="flex items-center gap-3.5 mb-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/8 ring-1 ring-primary/[0.06]">
            <BookOpen className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Docs</h1>
            <p className="text-[13px] text-muted-foreground/60">Everything you need to know about BookLite</p>
          </div>
        </div>
        <div className="mt-6 h-px bg-gradient-to-r from-primary/25 via-border/40 to-transparent" />
      </div>

      <nav className="mb-14 grid grid-cols-2 gap-3 sm:grid-cols-4" style={{ animationDelay: "80ms", animationFillMode: "both" }}>
        {NAV_ITEMS.map((item, i) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            className={[
              "group relative flex flex-col gap-2.5 rounded-2xl border border-border/30 bg-card p-4",
              "transition-all duration-200",
              "hover:-translate-y-1 hover:border-border/60 hover:shadow-md hover:shadow-primary/[0.04]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "animate-fade-up",
            ].join(" ")}
            style={{ animationDelay: `${i * 60 + 100}ms`, animationFillMode: "both" }}
          >
            <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${item.bg}`}>
              <item.icon className={`h-4 w-4 ${item.color}`} />
            </div>
            <div>
              <span className="text-sm font-semibold text-foreground">{item.label}</span>
              <p className="mt-0.5 text-[11px] text-muted-foreground/60 leading-snug">{item.desc}</p>
            </div>
            <ArrowRight className="absolute right-3 top-4 h-3.5 w-3.5 text-muted-foreground/0 transition-all duration-200 group-hover:text-muted-foreground/40 group-hover:translate-x-0.5" />
          </a>
        ))}
      </nav>

      <div className="space-y-16">
        <section id="kobo-setup" className="scroll-mt-20">
          <div className="flex items-center gap-3 mb-6 pl-3 border-l-2 border-status-processing/30">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-status-processing/8">
              <TabletSmartphone className="h-4 w-4 text-status-processing" />
            </div>
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Kobo setup</h2>
              <p className="text-[12px] text-muted-foreground/50 mt-0.5">Connect your Kobo e-reader and keep your books and reading progress synced.</p>
            </div>
          </div>
          <div className="ml-3 mb-6">
            <Step number={1}>
              Open{" "}
              <Link to="/kobo" className="font-medium text-primary hover:underline underline-offset-2">Kobo</Link>{" "}
              in the menu.
            </Step>
            <Step number={2}>Enable sync.</Step>
            <Step number={3}>Choose one or more collections to sync.</Step>
            <Step number={4}>Copy the API endpoint line from the Kobo page.</Step>
            <Step number={5}>Paste it into your Kobo configuration.</Step>
            <Step number={6} isLast>Sync from your device.</Step>
          </div>
          <div className="rounded-2xl border border-border/25 bg-muted/10 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Info className="h-3.5 w-3.5 text-muted-foreground/50" />
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/50">Good to know</span>
            </div>
            <ul className="space-y-2">
              <BulletItem>Only EPUB books sync to Kobo.</BulletItem>
              <BulletItem>Only books inside selected sync collections are included.</BulletItem>
              <BulletItem>Regenerating your token immediately invalidates the old token.</BulletItem>
            </ul>
          </div>
        </section>

        <section id="metadata-and-ai" className="scroll-mt-20">
          <div className="flex items-center gap-3 mb-6 pl-3 border-l-2 border-primary/25">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/8">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Metadata and AI</h2>
              <p className="text-[12px] text-muted-foreground/50 mt-0.5">How metadata is found for your books and when AI is used.</p>
            </div>
          </div>
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { icon: RefreshCw, text: "When uploading files, BookLite runs metadata preview automatically." },
                { icon: Info, text: "Source labels in upload cards show where metadata came from." },
                { icon: Shield, text: "Manual edits you make in upload/review fields are preserved." },
                { icon: Search, text: (<>Each book supports{" "}<span className="font-medium text-foreground">Fetch metadata</span> for a single refresh.</>) },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-3 rounded-xl border border-border/20 bg-card/60 p-4 transition-all duration-200 hover:border-border/40 hover:shadow-sm hover:shadow-black/[0.02]">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted/25 ring-1 ring-border/[0.06] mt-0.5">
                    <item.icon className="h-3.5 w-3.5 text-muted-foreground/60" />
                  </div>
                  <p className="text-sm text-foreground/80 leading-relaxed">{item.text}</p>
                </div>
              ))}
            </div>
            <div className="flex items-start gap-3 rounded-xl border border-border/20 bg-card/60 p-4 hover:border-border/40 transition-colors duration-200">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted/25 ring-1 ring-border/[0.06] mt-0.5">
                <RefreshCw className="h-3.5 w-3.5 text-muted-foreground/60" />
              </div>
              <p className="text-sm text-foreground/80 leading-relaxed">
                Library toolbar supports{" "}
                <span className="font-medium text-foreground">Refresh all metadata</span> for a full-library pass.
              </p>
            </div>
            <OwnerNote>
              Owners can enable/disable metadata providers in Administration &gt; System Settings. AI-assisted metadata resolution is optional and only applies when OpenRouter settings are enabled in instance configuration.
            </OwnerNote>
          </div>
        </section>

        <section id="accounts-and-roles" className="scroll-mt-20">
          <div className="flex items-center gap-3 mb-6 pl-3 border-l-2 border-status-completed/25">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-status-completed/8">
              <Users className="h-4 w-4 text-status-completed" />
            </div>
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Accounts and roles</h2>
              <p className="text-[12px] text-muted-foreground/50 mt-0.5">Member and owner permissions at a glance.</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 mb-5">
            <div className="rounded-2xl border border-border/30 bg-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-muted/30">
                  <Users className="h-3 w-3 text-muted-foreground/60" />
                </div>
                <Badge variant="secondary" className="text-[10px] font-semibold">Member</Badge>
              </div>
              <ul className="space-y-2.5">
                <BulletItem>Library, Collections, Uploads</BulletItem>
                <BulletItem>Kobo sync and Profile</BulletItem>
              </ul>
            </div>
            <div className="rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/[0.03] to-transparent dark:from-primary/[0.05] p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10">
                  <Shield className="h-3 w-3 text-primary" />
                </div>
                <Badge variant="default" className="text-[10px] font-semibold">Owner</Badge>
              </div>
              <ul className="space-y-2.5">
                <BulletItem>Everything members can do</BulletItem>
                <BulletItem>Administration panel access</BulletItem>
                <BulletItem>Create users, change roles, manage settings</BulletItem>
                <BulletItem>Enable/disable accounts</BulletItem>
              </ul>
            </div>
          </div>
          <div className="rounded-xl border border-border/25 bg-muted/10 p-4 flex items-start gap-2.5 mb-5">
            <Info className="h-4 w-4 text-muted-foreground/40 shrink-0 mt-0.5" />
            <p className="text-sm text-foreground/70">Disabled users cannot log in.</p>
          </div>
          <OwnerNote>Keep at least one active owner account so administration access is never lost.</OwnerNote>
        </section>

        <section id="troubleshooting" className="scroll-mt-20">
          <div className="flex items-center gap-3 mb-6 pl-3 border-l-2 border-status-queued/25">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-status-queued/8">
              <Wrench className="h-4 w-4 text-status-queued" />
            </div>
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Troubleshooting</h2>
              <p className="text-[12px] text-muted-foreground/50 mt-0.5">Quick fixes for common issues.</p>
            </div>
          </div>
          <div className="space-y-3">
            <TroubleshootItem title="No books on Kobo" icon={<TabletSmartphone className="h-4 w-4" />} defaultOpen>
              <ul className="space-y-2.5">
                <BulletItem>Check Kobo sync is enabled.</BulletItem>
                <BulletItem>Make sure at least one sync collection is selected.</BulletItem>
                <BulletItem>Only EPUB files are synced.</BulletItem>
                <BulletItem>If token was regenerated, update Kobo config with the new endpoint.</BulletItem>
              </ul>
            </TroubleshootItem>
            <TroubleshootItem title="Metadata missing or wrong" icon={<AlertTriangle className="h-4 w-4" />}>
              <ul className="space-y-2.5">
                <BulletItem>Edit metadata manually from upload review or Library details.</BulletItem>
                <BulletItem>Use Fetch metadata per book to retry with current providers.</BulletItem>
                <BulletItem>Owners can adjust enabled providers in Administration.</BulletItem>
              </ul>
            </TroubleshootItem>
            <TroubleshootItem title="Cannot log in" icon={<Lock className="h-4 w-4" />}>
              <ul className="space-y-2.5">
                <BulletItem>Confirm username/email and password.</BulletItem>
                <BulletItem>Ask an owner to verify your account is not disabled.</BulletItem>
              </ul>
            </TroubleshootItem>
          </div>
        </section>
      </div>

      <div className="h-20" />
    </div>
  );
};
