import React from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export const DocsPage: React.FC = () => {
  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Docs</h1>
        <p className="mt-1 text-sm text-muted-foreground">How to use BookLite</p>
      </div>

      <Card className="border-border/40">
        <CardHeader>
          <CardTitle className="text-base">Quick links</CardTitle>
          <CardDescription>Jump to a section</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <a href="#kobo-setup" className="text-sm text-primary hover:underline underline-offset-2">
            Kobo setup
          </a>
          <span className="text-muted-foreground/40">/</span>
          <a
            href="#metadata-and-ai"
            className="text-sm text-primary hover:underline underline-offset-2"
          >
            Metadata and AI
          </a>
          <span className="text-muted-foreground/40">/</span>
          <a
            href="#accounts-and-roles"
            className="text-sm text-primary hover:underline underline-offset-2"
          >
            Accounts and roles
          </a>
          <span className="text-muted-foreground/40">/</span>
          <a
            href="#troubleshooting"
            className="text-sm text-primary hover:underline underline-offset-2"
          >
            Troubleshooting
          </a>
        </CardContent>
      </Card>

      <Card id="kobo-setup" className="border-border/40 scroll-mt-20">
        <CardHeader>
          <CardTitle className="text-base">Kobo setup</CardTitle>
          <CardDescription>Connect your Kobo and keep books/progress synced</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-foreground/85">
          <ol className="list-decimal space-y-1 pl-4">
            <li>
              Open <Link to="/kobo" className="text-primary hover:underline">Kobo</Link> in the menu.
            </li>
            <li>Enable sync.</li>
            <li>Choose one or more collections to sync.</li>
            <li>Copy the API endpoint line from the Kobo page.</li>
            <li>Paste it into your Kobo configuration.</li>
            <li>Sync from your device.</li>
          </ol>
          <Separator />
          <ul className="list-disc space-y-1 pl-4">
            <li>Only EPUB books sync to Kobo.</li>
            <li>Only books inside selected sync collections are included.</li>
            <li>Regenerating your token immediately invalidates the old token.</li>
          </ul>
        </CardContent>
      </Card>

      <Card id="metadata-and-ai" className="border-border/40 scroll-mt-20">
        <CardHeader>
          <CardTitle className="text-base">Metadata and AI</CardTitle>
          <CardDescription>How metadata is found and when AI is used</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-foreground/85">
          <ul className="list-disc space-y-1 pl-4">
            <li>When uploading files, BookLite runs metadata preview automatically.</li>
            <li>Source labels in upload cards show where metadata came from.</li>
            <li>Manual edits you make in upload/review fields are preserved.</li>
            <li>
              In Library, each book supports <span className="font-medium">Fetch metadata</span> for
              a single refresh.
            </li>
            <li>
              Library toolbar supports <span className="font-medium">Refresh all metadata</span> for
              a full-library pass.
            </li>
          </ul>

          <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
            <div className="mb-1 flex items-center gap-2">
              <Badge variant="secondary" className="text-[10px]">
                Owner note
              </Badge>
            </div>
            <p className="text-sm text-foreground/80">
              Owners can enable/disable metadata providers in Administration &gt; System Settings.
              AI-assisted metadata resolution is optional and only applies when OpenRouter settings
              are enabled in instance configuration.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card id="accounts-and-roles" className="border-border/40 scroll-mt-20">
        <CardHeader>
          <CardTitle className="text-base">Accounts and roles</CardTitle>
          <CardDescription>Member and owner permissions</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-foreground/85">
          <ul className="list-disc space-y-1 pl-4">
            <li>Members can use Library, Collections, Uploads, Kobo, and Profile.</li>
            <li>
              Owners can also open Administration to create users, change roles, disable/enable
              accounts, and edit system metadata settings.
            </li>
            <li>Disabled users cannot log in.</li>
          </ul>

          <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
            <div className="mb-1 flex items-center gap-2">
              <Badge variant="secondary" className="text-[10px]">
                Owner note
              </Badge>
            </div>
            <p className="text-sm text-foreground/80">
              Keep at least one active owner account so administration access is never lost.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card id="troubleshooting" className="border-border/40 scroll-mt-20">
        <CardHeader>
          <CardTitle className="text-base">Troubleshooting</CardTitle>
          <CardDescription>Quick fixes for common issues</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-foreground/85">
          <div>
            <h3 className="font-medium">No books on Kobo</h3>
            <ul className="mt-1 list-disc space-y-1 pl-4">
              <li>Check Kobo sync is enabled.</li>
              <li>Make sure at least one sync collection is selected.</li>
              <li>Only EPUB files are synced.</li>
              <li>If token was regenerated, update Kobo config with the new endpoint.</li>
            </ul>
          </div>

          <div>
            <h3 className="font-medium">Metadata missing or wrong</h3>
            <ul className="mt-1 list-disc space-y-1 pl-4">
              <li>Edit metadata manually from upload review or Library details.</li>
              <li>Use Fetch metadata per book to retry with current providers.</li>
              <li>Owners can adjust enabled providers in Administration.</li>
            </ul>
          </div>

          <div>
            <h3 className="font-medium">Cannot log in</h3>
            <ul className="mt-1 list-disc space-y-1 pl-4">
              <li>Confirm username/email and password.</li>
              <li>Ask an owner to verify your account is not disabled.</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
