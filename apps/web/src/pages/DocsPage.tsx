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
  Library,
  Star,
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
        "group w-full text-left rounded-md border transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        open
          ? "border-border bg-muted/20"
          : "border-border bg-card hover:bg-muted/10",
      ].join(" ")}
    >
      <div className="flex items-center gap-2.5 px-4 py-3">
        <span className="text-muted-foreground">{icon}</span>
        <span className="flex-1 text-sm font-medium text-foreground">{title}</span>
        <div
          className={[
            "text-muted-foreground/50 transition-transform duration-150",
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
          <div className="px-4 pb-4 pl-10">{children}</div>
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
  <li className="flex items-start gap-3 text-sm text-foreground/85 leading-relaxed">
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
      {number}
    </span>
    <span className="pt-0.5">{children}</span>
  </li>
);

const OwnerNote: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="border-l-2 border-primary/40 pl-4 py-3 mt-4">
    <div className="flex items-center gap-1.5 mb-1">
      <Shield className="h-3.5 w-3.5 text-primary" />
      <span className="text-xs font-semibold uppercase tracking-wide text-primary/80">
        Owner note
      </span>
    </div>
    <p className="text-sm text-foreground/75 leading-relaxed">{children}</p>
  </div>
);

const BulletItem: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <li className="text-sm text-foreground/80 leading-relaxed list-disc ml-4">
    {children}
  </li>
);

const NAV_ITEMS = [
  { id: "about", label: "About", icon: BookOpen },
  { id: "features", label: "Features", icon: Star },
  { id: "kobo-setup", label: "Kobo setup", icon: TabletSmartphone },
  { id: "metadata-and-ai", label: "Metadata & AI", icon: Sparkles },
  { id: "accounts-and-roles", label: "Accounts & roles", icon: Users },
  { id: "troubleshooting", label: "Troubleshooting", icon: Wrench },
] as const;

export const DocsPage: React.FC = () => {
  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold tracking-tight">Docs</h1>
      <p className="mt-1 text-sm text-muted-foreground mb-10">
        Everything you need to know about BookLite.
      </p>

      {/* Table of contents */}
      <nav className="mb-12 rounded-md border border-border bg-muted/20 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          On this page
        </p>
        <ul className="space-y-1.5">
          {NAV_ITEMS.map((item) => (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                className="group flex items-center gap-2 text-sm text-foreground/80 hover:text-primary transition-colors duration-150"
              >
                <ChevronRight className="h-3 w-3 text-muted-foreground/40 group-hover:text-primary transition-colors duration-150" />
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="space-y-14">
        {/* ---- About ---- */}
        <section id="about" className="scroll-mt-20">
          <h2 className="text-xl font-semibold tracking-tight pb-2 border-b border-border mb-5">
            About
          </h2>
          <p className="text-sm text-foreground/85 leading-relaxed mb-4">
            BookLite is a simple, self-hosted digital book library. Upload books, organize them in collections, fetch metadata, and sync to your Kobo &mdash; nothing more, nothing less.
          </p>
          <p className="text-sm text-foreground/85 leading-relaxed mb-4">
            It is inspired by{" "}
            <a href="https://github.com/booklore-app/booklore" target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline underline-offset-2">BookLore</a>,
            a full-featured self-hosted library with OPDS, KOReader sync, comic and audiobook support, BookDrop imports, and much more. BookLite deliberately leaves all of that out to stay lightweight and focused. If you need those features, BookLore is the project for you.
          </p>
        </section>

        {/* ---- Features ---- */}
        <section id="features" className="scroll-mt-20">
          <h2 className="text-xl font-semibold tracking-tight pb-2 border-b border-border mb-5">
            Features
          </h2>
          <ul className="space-y-2">
            <BulletItem>Upload EPUB, KEPUB, and PDF files from the web UI.</BulletItem>
            <BulletItem>Organize books into collections with drag and drop.</BulletItem>
            <BulletItem>Automatic metadata from 7 providers (Open Library, Google Books, Amazon, bol.com, Hardcover, Goodreads, Douban).</BulletItem>
            <BulletItem>Kobo sync &mdash; books and reading progress over the built-in Kobo API.</BulletItem>
            <BulletItem>Multi-user with simple Owner/Member roles.</BulletItem>
            <BulletItem>Built-in EPUB and KEPUB reader.</BulletItem>
            <BulletItem>Full-text search powered by SQLite FTS5.</BulletItem>
          </ul>
        </section>

        {/* ---- Kobo setup ---- */}
        <section id="kobo-setup" className="scroll-mt-20">
          <h2 className="text-xl font-semibold tracking-tight pb-2 border-b border-border mb-5">
            Kobo setup
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Setting up Kobo sync with BookLite.
          </p>
          <div className="space-y-6 mb-6">
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3">In BookLite (one-time setup)</h3>
              <ol className="space-y-2.5">
                <Step number={1}>
                  Go to{" "}
                  <Link to="/kobo" className="font-medium text-primary hover:underline underline-offset-2">Kobo</Link>{" "}
                  in the left sidebar.
                </Step>
                <Step number={2}>Enable sync.</Step>
                <Step number={3}>Choose to sync all books, or enable specific collections such as Favorites.</Step>
                <Step number={4}>Scroll down to the API endpoint field and click Copy endpoint.</Step>
              </ol>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3">On your Mac (one-time device setup)</h3>
              <ol className="space-y-2.5">
                <Step number={1}>Connect your Kobo via USB. It will appear in Finder.</Step>
                <Step number={2}>Open the Kobo volume in Finder.</Step>
                <Step number={3}>Press Cmd + Shift + . to reveal hidden files and folders.</Step>
                <Step number={4}>
                  Navigate to <code>.kobo → Kobo</code>, then open <code>Kobo eReader.conf</code> in TextEdit.
                </Step>
                <Step number={5}>Use Cmd + F to search for <code>api_endpoint</code>.</Step>
                <Step number={6}>Replace that entire line with the endpoint you copied from BookLite.</Step>
                <Step number={7}>Save with Cmd + S and close the file.</Step>
                <Step number={8}>Eject the Kobo from Finder.</Step>
              </ol>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3">Syncing</h3>
              <ol className="space-y-2.5">
                <Step number={1}>On your Kobo, tap the sync icon in the top-right corner.</Step>
                <Step number={2}>Your books will appear. Covers may take a moment to load.</Step>
              </ol>
            </div>
          </div>
          <div className="rounded-md border border-border bg-muted/15 p-4">
            <div className="flex items-center gap-1.5 mb-2.5">
              <Info className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Good to know</span>
            </div>
            <ul className="space-y-1.5">
              <BulletItem>Only EPUB and KEPUB books sync to Kobo.</BulletItem>
              <BulletItem>Reading progress syncs Kobo → BookLite automatically. Enable Two-way progress sync in settings for the reverse direction.</BulletItem>
              <BulletItem>If you share the setup with someone else, they can use the same API endpoint. There is no need to regenerate the token.</BulletItem>
            </ul>
          </div>
        </section>

        {/* ---- Metadata and AI ---- */}
        <section id="metadata-and-ai" className="scroll-mt-20">
          <h2 className="text-xl font-semibold tracking-tight pb-2 border-b border-border mb-5">
            Metadata and AI
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            How metadata is found for your books and when AI is used.
          </p>
          <ul className="space-y-2 mb-5">
            <BulletItem>When uploading files, BookLite runs metadata preview automatically.</BulletItem>
            <BulletItem>Source labels in upload cards show where metadata came from.</BulletItem>
            <BulletItem>Manual edits you make in upload/review fields are preserved.</BulletItem>
            <BulletItem>
              Each book supports{" "}
              <span className="font-medium text-foreground">Fetch metadata</span> for a single refresh.
            </BulletItem>
            <BulletItem>
              Library toolbar supports{" "}
              <span className="font-medium text-foreground">Refresh all metadata</span> for a full-library pass.
            </BulletItem>
          </ul>
          <OwnerNote>
            Owners can enable/disable metadata providers in Administration &gt; System Settings. AI-assisted metadata resolution is optional and only applies when OpenRouter settings are enabled in instance configuration.
          </OwnerNote>
        </section>

        {/* ---- Accounts and roles ---- */}
        <section id="accounts-and-roles" className="scroll-mt-20">
          <h2 className="text-xl font-semibold tracking-tight pb-2 border-b border-border mb-5">
            Accounts and roles
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Member and owner permissions at a glance.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 mb-5">
            <div className="rounded-md border border-border p-4">
              <div className="flex items-center gap-2 mb-3">
                <Badge variant="secondary" className="text-[11px] font-semibold">Member</Badge>
              </div>
              <ul className="space-y-1.5">
                <BulletItem>Library, Collections, Uploads</BulletItem>
                <BulletItem>Kobo sync and Profile</BulletItem>
              </ul>
            </div>
            <div className="rounded-md border border-border p-4">
              <div className="flex items-center gap-2 mb-3">
                <Badge variant="default" className="text-[11px] font-semibold">Owner</Badge>
              </div>
              <ul className="space-y-1.5">
                <BulletItem>Everything members can do</BulletItem>
                <BulletItem>Administration panel access</BulletItem>
                <BulletItem>Create users, change roles, manage settings</BulletItem>
                <BulletItem>Enable/disable accounts</BulletItem>
              </ul>
            </div>
          </div>
          <div className="rounded-md border border-border bg-muted/15 p-4 flex items-start gap-2.5 mb-4">
            <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <p className="text-sm text-foreground/80">Disabled users cannot log in.</p>
          </div>
          <OwnerNote>Keep at least one active owner account so administration access is never lost.</OwnerNote>
        </section>

        {/* ---- Troubleshooting ---- */}
        <section id="troubleshooting" className="scroll-mt-20">
          <h2 className="text-xl font-semibold tracking-tight pb-2 border-b border-border mb-5">
            Troubleshooting
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Quick fixes for common issues.
          </p>
          <div className="space-y-2">
            <TroubleshootItem title="No books on Kobo" icon={<TabletSmartphone className="h-4 w-4" />} defaultOpen>
              <ul className="space-y-1.5">
                <BulletItem>Check Kobo sync is enabled.</BulletItem>
                <BulletItem>Make sure at least one sync collection is selected.</BulletItem>
                <BulletItem>Only EPUB and KEPUB files are synced.</BulletItem>
                <BulletItem>If token was regenerated, update Kobo config with the new endpoint.</BulletItem>
              </ul>
            </TroubleshootItem>
            <TroubleshootItem title="Metadata missing or wrong" icon={<AlertTriangle className="h-4 w-4" />}>
              <ul className="space-y-1.5">
                <BulletItem>Edit metadata manually from upload review or Library details.</BulletItem>
                <BulletItem>Use Fetch metadata per book to retry with current providers.</BulletItem>
                <BulletItem>Owners can adjust enabled providers in Administration.</BulletItem>
              </ul>
            </TroubleshootItem>
            <TroubleshootItem title="Cannot log in" icon={<Lock className="h-4 w-4" />}>
              <ul className="space-y-1.5">
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
