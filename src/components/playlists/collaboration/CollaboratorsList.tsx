import { useState } from "react";
import {
  Users,
  Crown,
  Edit,
  Eye,
  MoreHorizontal,
  UserMinus,
  UserPlus,
  Copy,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Collaborator, CollaboratorRole } from "./types";
import { useInviteCollaborator, useRemoveCollaborator } from "./use-collaborative-playlist";

interface CollaboratorsListProps {
  playlistId: string;
  collaborators: Collaborator[];
  userRole: CollaboratorRole | null;
  shareCode?: string | null;
}

const roleIcons: Record<CollaboratorRole, typeof Crown> = {
  owner: Crown,
  editor: Edit,
  viewer: Eye,
};

const roleLabels: Record<CollaboratorRole, string> = {
  owner: "Owner",
  editor: "Editor",
  viewer: "Viewer",
};

export function CollaboratorsList({
  playlistId,
  collaborators,
  userRole,
  shareCode,
}: CollaboratorsListProps) {
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<CollaboratorRole>("viewer");
  const [copied, setCopied] = useState(false);

  const inviteMutation = useInviteCollaborator();
  const removeMutation = useRemoveCollaborator();

  const isOwner = userRole === "owner";

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;

    await inviteMutation.mutateAsync({
      playlistId,
      email: inviteEmail,
      role: inviteRole,
    });

    setInviteEmail("");
    setIsInviteOpen(false);
  };

  const handleCopyShareLink = async () => {
    if (!shareCode) return;
    const link = `${window.location.origin}/playlists/join/${shareCode}`;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          <h3 className="font-semibold">Collaborators</h3>
          <Badge variant="secondary">{collaborators.length}</Badge>
        </div>

        {isOwner && (
          <div className="flex items-center gap-2">
            {shareCode && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyShareLink}
                className="gap-1"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                {copied ? "Copied!" : "Copy Link"}
              </Button>
            )}

            <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1">
                  <UserPlus className="h-4 w-4" />
                  Invite
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Invite Collaborator</DialogTitle>
                  <DialogDescription>
                    Send an invitation to collaborate on this playlist.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="friend@example.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="role">Role</Label>
                    <Select
                      value={inviteRole}
                      onValueChange={(v) => setInviteRole(v as CollaboratorRole)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="editor">
                          <div className="flex items-center gap-2">
                            <Edit className="h-4 w-4" />
                            <span>Editor</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="viewer">
                          <div className="flex items-center gap-2">
                            <Eye className="h-4 w-4" />
                            <span>Viewer</span>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {inviteRole === "editor"
                        ? "Editors can add songs, approve suggestions, and manage the playlist."
                        : "Viewers can suggest songs and vote on suggestions."}
                    </p>
                  </div>
                </div>

                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setIsInviteOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleInvite}
                    disabled={!inviteEmail.trim() || inviteMutation.isPending}
                  >
                    {inviteMutation.isPending ? "Inviting..." : "Send Invite"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      <div className="space-y-2">
        {collaborators.map((collaborator) => {
          const RoleIcon = roleIcons[collaborator.role];
          return (
            <div
              key={collaborator.id}
              className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-sm font-medium">
                      {collaborator.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  {collaborator.isOnline && (
                    <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-background" />
                  )}
                </div>
                <div>
                  <p className="font-medium">{collaborator.name}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <RoleIcon className="h-3 w-3" />
                    <span>{roleLabels[collaborator.role]}</span>
                  </div>
                </div>
              </div>

              {isOwner && collaborator.role !== "owner" && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() =>
                        removeMutation.mutate({
                          playlistId,
                          userId: collaborator.userId,
                        })
                      }
                      className="text-destructive"
                    >
                      <UserMinus className="mr-2 h-4 w-4" />
                      Remove
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
