import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Info,
  Lock,
  Share2,
  Shield,
  Sparkles,
  Star,
  TabletSmartphone,
  Upload,
  Users,
  Wrench,
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
        "group w-full rounded-md border text-left transition-colors duration-150",
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
  children: React.ReactNode;
}> = ({ number, children }) => (
  <li className="flex items-start gap-3 text-sm leading-relaxed text-foreground/85">
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
      {number}
    </span>
    <span className="pt-0.5">{children}</span>
  </li>
);

const OwnerNote: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="mt-4 border-l-2 border-primary/40 py-3 pl-4">
    <div className="mb-1 flex items-center gap-1.5">
      <Shield className="h-3.5 w-3.5 text-primary" />
      <span className="text-xs font-semibold uppercase tracking-wide text-primary/80">
        Owner note
      </span>
    </div>
    <p className="text-sm leading-relaxed text-foreground/75">{children}</p>
  </div>
);

const BulletItem: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <li className="ml-4 list-disc text-sm leading-relaxed text-foreground/80">{children}</li>
);

const NAV_ITEMS = [
  { id: "about", label: "About", icon: BookOpen },
  { id: "features", label: "Features", icon: Star },
  { id: "upload-flow", label: "Upload flow", icon: Upload },
  { id: "metadata-and-ai", label: "Metadata & AI", icon: Sparkles },
  { id: "sharing-books", label: "Sharing books", icon: Share2 },
  { id: "accounts-and-admin", label: "Accounts & admin", icon: Users },
  { id: "kobo-setup", label: "Kobo setup", icon: TabletSmartphone },
  { id: "troubleshooting", label: "Troubleshooting", icon: Wrench },
] as const;

export const DocsPage: React.FC = () => {
  const location = useLocation();

  useEffect(() => {
    const hash = location.hash.slice(1);
    if (!hash) return;

    let frameId = 0;
    let attempts = 0;

    const scrollToHashTarget = () => {
      const target = document.getElementById(decodeURIComponent(hash));
      if (target) {
        target.scrollIntoView({ block: "start" });
        return;
      }

      attempts += 1;
      if (attempts < 10) {
        frameId = window.requestAnimationFrame(scrollToHashTarget);
      }
    };

    frameId = window.requestAnimationFrame(scrollToHashTarget);

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [location.hash]);

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold tracking-tight">Docs</h1>
      <p className="mb-10 mt-1 text-sm text-muted-foreground">
        Everything you need to know about BookLite.
      </p>

      <nav className="mb-12 rounded-md border border-border bg-muted/20 p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          On this page
        </p>
        <ul className="space-y-1.5">
          {NAV_ITEMS.map((item) => (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                className="group flex items-center gap-2 text-sm text-foreground/80 transition-colors duration-150 hover:text-primary"
              >
                <ChevronRight className="h-3 w-3 text-muted-foreground/40 transition-colors duration-150 group-hover:text-primary" />
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="space-y-14">
        <section id="about" className="scroll-mt-20">
          <h2 className="mb-5 border-b border-border pb-2 text-xl font-semibold tracking-tight">
            About
          </h2>
          <p className="mb-4 text-sm leading-relaxed text-foreground/85">
            BookLite is a focused, self-hosted digital book library. Upload books, organize them,
            enrich their metadata, read in the browser, share them with other users, and sync
            selected titles to your Kobo.
          </p>
          <p className="text-sm leading-relaxed text-foreground/85">
            It is inspired by{" "}
            <a
              href="https://github.com/booklore-app/booklore"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary hover:underline underline-offset-2"
            >
              BookLore
            </a>
            , but keeps a smaller scope on purpose. BookLite leaves out OPDS, KOReader sync,
            comics, audiobooks, and other larger-library features so the day-to-day workflow stays
            simple.
          </p>
        </section>

        <section id="features" className="scroll-mt-20">
          <h2 className="mb-5 border-b border-border pb-2 text-xl font-semibold tracking-tight">
            Features
          </h2>
          <ul className="space-y-2">
            <BulletItem>Upload EPUB, KEPUB, and PDF files from the web UI.</BulletItem>
            <BulletItem>Read EPUB and KEPUB books directly in BookLite.</BulletItem>
            <BulletItem>
              Organize books with custom collections plus built-in Favorites, Shared with me, and
              Uncollected shelves.
            </BulletItem>
            <BulletItem>
              Fetch and merge metadata from 7 providers instead of relying on a single source.
            </BulletItem>
            <BulletItem>Review cover suggestions and switch covers later from the library.</BulletItem>
            <BulletItem>Share books directly between users.</BulletItem>
            <BulletItem>Kobo sync for EPUB and KEPUB, including reading progress sync.</BulletItem>
            <BulletItem>
              Owner tools for user management, impersonation, provider settings, upload limits,
              diagnostics, and API tokens.
            </BulletItem>
            <BulletItem>Full-text search powered by SQLite FTS5.</BulletItem>
          </ul>
        </section>

        <section id="upload-flow" className="scroll-mt-20">
          <h2 className="mb-5 border-b border-border pb-2 text-xl font-semibold tracking-tight">
            Upload flow
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">
            What happens between dropping a file and seeing a finished book in your library.
          </p>
          <ol className="space-y-2.5">
            <Step number={1}>
              Go to <Link to="/uploads" className="font-medium text-primary hover:underline underline-offset-2">Upload</Link>{" "}
              and drag in one or more files, or click to browse.
            </Step>
            <Step number={2}>
              BookLite extracts an initial title from the filename and immediately runs metadata
              preview for each draft.
            </Step>
            <Step number={3}>
              Review the draft before import. You can edit title, author, series, description,
              choose a suggested cover, mark it as a favorite, and assign collections.
            </Step>
            <Step number={4}>
              Click <span className="font-medium text-foreground">Add selected</span>. Files are
              uploaded in batches and queued as background import jobs.
            </Step>
            <Step number={5}>
              During processing, BookLite creates the book record, applies filename defaults,
              optionally enriches metadata again, localizes the chosen cover, and adds the book to
              the selected collections and Favorites if requested.
            </Step>
          </ol>
          <div className="mt-5 rounded-md border border-border bg-muted/15 p-4">
            <div className="mb-2.5 flex items-center gap-1.5">
              <Info className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Good to know
              </span>
            </div>
            <ul className="space-y-1.5">
              <BulletItem>Only EPUB, KEPUB, and PDF files are accepted.</BulletItem>
              <BulletItem>Manual title, author, and description edits are preserved during enrichment.</BulletItem>
              <BulletItem>Owners can change the upload size limit in Administration.</BulletItem>
            </ul>
          </div>
        </section>

        <section id="metadata-and-ai" className="scroll-mt-20">
          <h2 className="mb-5 border-b border-border pb-2 text-xl font-semibold tracking-tight">
            Metadata and AI
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">
            How BookLite chooses metadata, covers, and when the optional AI resolver is involved.
          </p>
          <ul className="mb-5 space-y-2">
            <BulletItem>
              Enabled providers are queried in parallel: Open Library, Google Books, Amazon,
              bol.com, Hardcover, Goodreads, and Douban.
            </BulletItem>
            <BulletItem>
              Provider results are scored by title match, author match, completeness, and provider
              trust.
            </BulletItem>
            <BulletItem>
              The final title, author, series, and description can come from different providers if
              that produces a better result.
            </BulletItem>
            <BulletItem>
              Covers are ranked separately, with extra weighting for provider preference and image
              quality hints.
            </BulletItem>
            <BulletItem>
              <span className="font-medium text-foreground">Refresh metadata</span> re-runs the
              provider pass for a book. You can also refresh multiple selected books at once from
              the library toolbar.
            </BulletItem>
          </ul>
          <OwnerNote>
            OpenRouter is optional. When enabled, BookLite uses the filename-derived title and
            author as the source of truth, asks the model to discard wrong matches, normalize
            fields like series, and fill gaps when confident. Descriptions and covers still stay
            grounded in provider data.
          </OwnerNote>
        </section>

        <section id="sharing-books" className="scroll-mt-20">
          <h2 className="mb-5 border-b border-border pb-2 text-xl font-semibold tracking-tight">
            Sharing books
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Share owned books with other active users without duplicating the source file.
          </p>
          <ul className="space-y-2">
            <BulletItem>
              Owners can share a book from the book menu, the detail drawer, or the multi-select
              toolbar.
            </BulletItem>
            <BulletItem>
              Recipients see shared books in the built-in{" "}
              <span className="font-medium text-foreground">Shared with me</span> collection.
            </BulletItem>
            <BulletItem>
              Recipients can read, download, and track their own status and progress on shared
              books.
            </BulletItem>
            <BulletItem>
              Hiding a shared book only removes it from the recipient&apos;s view. It does not delete
              the owner&apos;s book.
            </BulletItem>
            <BulletItem>
              Ownership stays with the original user, and only that owner can manage outgoing
              shares for the book.
            </BulletItem>
          </ul>
        </section>

        <section id="accounts-and-admin" className="scroll-mt-20">
          <h2 className="mb-5 border-b border-border pb-2 text-xl font-semibold tracking-tight">
            Accounts and admin
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Member permissions, owner-only controls, and how impersonation works.
          </p>
          <div className="mb-5 grid gap-4 sm:grid-cols-2">
            <div className="rounded-md border border-border p-4">
              <div className="mb-3 flex items-center gap-2">
                <Badge variant="secondary" className="text-[11px] font-semibold">
                  Member
                </Badge>
              </div>
              <ul className="space-y-1.5">
                <BulletItem>Library, collections, uploads, Kobo, reader, and profile.</BulletItem>
                <BulletItem>Receive shared books from other users.</BulletItem>
                <BulletItem>Hide shared books from your own library when you no longer want them.</BulletItem>
              </ul>
            </div>
            <div className="rounded-md border border-border p-4">
              <div className="mb-3 flex items-center gap-2">
                <Badge variant="default" className="text-[11px] font-semibold">
                  Owner
                </Badge>
              </div>
              <ul className="space-y-1.5">
                <BulletItem>Everything members can do.</BulletItem>
                <BulletItem>Create users, change roles, disable accounts, and delete eligible users.</BulletItem>
                <BulletItem>Configure metadata providers, AI resolver, upload limits, and diagnostics.</BulletItem>
                <BulletItem>View admin activity logs and generate API/LLM tokens.</BulletItem>
                <BulletItem>Impersonate active member accounts for support or debugging.</BulletItem>
              </ul>
            </div>
          </div>
          <div className="mb-4 flex items-start gap-2.5 rounded-md border border-border bg-muted/15 p-4">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <p className="text-sm text-foreground/80">
              Disabled users cannot log in, and only active member accounts can be impersonated.
            </p>
          </div>
          <OwnerNote>
            Impersonation switches this browser into the member session and keeps your owner session
            parked behind a restore overlay so you can come back when you are done.
          </OwnerNote>
        </section>

        <section id="kobo-setup" className="scroll-mt-20">
          <h2 className="mb-5 border-b border-border pb-2 text-xl font-semibold tracking-tight">
            Kobo setup
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Setting up Kobo sync with BookLite.
          </p>
          <div className="mb-6 space-y-6">
            <div>
              <h3 className="mb-3 text-sm font-semibold text-foreground">In BookLite (one-time setup)</h3>
              <ol className="space-y-2.5">
                <Step number={1}>
                  Go to{" "}
                  <Link to="/kobo" className="font-medium text-primary hover:underline underline-offset-2">
                    Kobo
                  </Link>{" "}
                  in the left sidebar.
                </Step>
                <Step number={2}>Enable sync.</Step>
                <Step number={3}>Choose to sync all books, or select specific collections.</Step>
                <Step number={4}>Copy the full endpoint from the API endpoint field.</Step>
              </ol>
            </div>

            <div>
              <h3 className="mb-3 text-sm font-semibold text-foreground">On your Mac (one-time device setup)</h3>
              <ol className="space-y-2.5">
                <Step number={1}>Connect your Kobo via USB. It will appear in Finder.</Step>
                <Step number={2}>Open the Kobo volume in Finder.</Step>
                <Step number={3}>Press Cmd + Shift + . to reveal hidden files and folders.</Step>
                <Step number={4}>
                  Navigate to <code>.kobo → Kobo</code>, then open <code>Kobo eReader.conf</code>
                  in TextEdit.
                </Step>
                <Step number={5}>Use Cmd + F to search for <code>api_endpoint</code>.</Step>
                <Step number={6}>Replace that full line with the endpoint you copied from BookLite.</Step>
                <Step number={7}>Save the file and eject the Kobo.</Step>
              </ol>
            </div>

            <div>
              <h3 className="mb-3 text-sm font-semibold text-foreground">Syncing</h3>
              <ol className="space-y-2.5">
                <Step number={1}>Tap the sync icon on your Kobo.</Step>
                <Step number={2}>Your books will appear. Covers can take a moment to populate.</Step>
              </ol>
            </div>
          </div>
          <div className="rounded-md border border-border bg-muted/15 p-4">
            <div className="mb-2.5 flex items-center gap-1.5">
              <Info className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Good to know
              </span>
            </div>
            <ul className="space-y-1.5">
              <BulletItem>Only EPUB and KEPUB books sync to Kobo.</BulletItem>
              <BulletItem>Each user has their own Kobo token and sync settings.</BulletItem>
              <BulletItem>Regenerating the token invalidates the previous endpoint.</BulletItem>
              <BulletItem>Reading progress syncs from Kobo back into BookLite automatically.</BulletItem>
            </ul>
          </div>
        </section>

        <section id="troubleshooting" className="scroll-mt-20">
          <h2 className="mb-5 border-b border-border pb-2 text-xl font-semibold tracking-tight">
            Troubleshooting
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Quick fixes for common issues.
          </p>
          <div className="space-y-2">
            <TroubleshootItem
              title="No books on Kobo"
              icon={<TabletSmartphone className="h-4 w-4" />}
              defaultOpen
            >
              <ul className="space-y-1.5">
                <BulletItem>Check that Kobo sync is enabled.</BulletItem>
                <BulletItem>Make sure sync all books is on, or at least one sync collection is selected.</BulletItem>
                <BulletItem>Only EPUB and KEPUB files are eligible for Kobo sync.</BulletItem>
                <BulletItem>If you regenerated the token, update the device endpoint in Kobo config.</BulletItem>
              </ul>
            </TroubleshootItem>
            <TroubleshootItem
              title="Metadata missing or wrong"
              icon={<AlertTriangle className="h-4 w-4" />}
            >
              <ul className="space-y-1.5">
                <BulletItem>Edit metadata manually from upload review or the library detail drawer.</BulletItem>
                <BulletItem>Use Refresh metadata to retry with the currently enabled providers.</BulletItem>
                <BulletItem>Try switching the cover manually if the text metadata is correct but the image is not.</BulletItem>
                <BulletItem>Owners can adjust provider and OpenRouter settings in Administration.</BulletItem>
              </ul>
            </TroubleshootItem>
            <TroubleshootItem title="A shared book disappeared" icon={<Share2 className="h-4 w-4" />}>
              <ul className="space-y-1.5">
                <BulletItem>Check the Shared with me collection in the Library view.</BulletItem>
                <BulletItem>If you hid the share, ask the owner to share the book again.</BulletItem>
                <BulletItem>If the owner revoked the share, the book will no longer appear for recipients.</BulletItem>
              </ul>
            </TroubleshootItem>
            <TroubleshootItem title="Cannot log in" icon={<Lock className="h-4 w-4" />}>
              <ul className="space-y-1.5">
                <BulletItem>Confirm your username or email and password.</BulletItem>
                <BulletItem>Ask an owner to verify that your account is not disabled.</BulletItem>
              </ul>
            </TroubleshootItem>
          </div>
        </section>
      </div>

      <div className="h-20" />
    </div>
  );
};
