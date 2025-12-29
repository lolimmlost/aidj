import { useState } from "react";
import {
  Users,
  Globe,
  Lock,
  Link,
  Lightbulb,
  Gauge,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEnableCollaboration } from "./use-collaborative-playlist";
import type { PlaylistPrivacy } from "./types";

interface EnableCollaborationDialogProps {
  playlistId: string;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
}

const privacyOptions: { value: PlaylistPrivacy; label: string; icon: typeof Globe; description: string }[] = [
  {
    value: "public",
    label: "Public",
    icon: Globe,
    description: "Anyone can view and suggest songs",
  },
  {
    value: "invite_only",
    label: "Invite Only",
    icon: Link,
    description: "Only invited users can access with a share link",
  },
  {
    value: "private",
    label: "Private",
    icon: Lock,
    description: "Only you and invited users can access",
  },
];

export function EnableCollaborationDialog({
  playlistId,
  isOpen: controlledIsOpen,
  onOpenChange: controlledOnOpenChange,
  trigger,
}: EnableCollaborationDialogProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isOpen = controlledIsOpen ?? internalIsOpen;
  const onOpenChange = controlledOnOpenChange ?? setInternalIsOpen;

  const [privacy, setPrivacy] = useState<PlaylistPrivacy>("invite_only");
  const [allowSuggestions, setAllowSuggestions] = useState(true);
  const [autoApproveThreshold, setAutoApproveThreshold] = useState<number | null>(3);
  const [useAutoApprove, setUseAutoApprove] = useState(true);

  const enableMutation = useEnableCollaboration();

  const handleEnable = async () => {
    await enableMutation.mutateAsync({
      playlistId,
      settings: {
        privacy,
        allowSuggestions,
        autoApproveThreshold: useAutoApprove ? autoApproveThreshold : null,
      },
    });
    onOpenChange(false);
  };

  const selectedPrivacy = privacyOptions.find((p) => p.value === privacy)!;
  const PrivacyIcon = selectedPrivacy.icon;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Enable Collaboration
          </DialogTitle>
          <DialogDescription>
            Turn this playlist into a collaborative space where others can suggest and vote on songs.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Privacy Setting */}
          <div className="space-y-3">
            <Label>Privacy</Label>
            <Select value={privacy} onValueChange={(v) => setPrivacy(v as PlaylistPrivacy)}>
              <SelectTrigger>
                <SelectValue>
                  <div className="flex items-center gap-2">
                    <PrivacyIcon className="h-4 w-4" />
                    <span>{selectedPrivacy.label}</span>
                  </div>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {privacyOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <div className="flex items-center gap-2">
                      <option.icon className="h-4 w-4" />
                      <div>
                        <p>{option.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {option.description}
                        </p>
                      </div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Allow Suggestions */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <Lightbulb className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <Label htmlFor="allow-suggestions" className="cursor-pointer">
                  Allow Song Suggestions
                </Label>
                <p className="text-xs text-muted-foreground">
                  Collaborators can suggest songs to add
                </p>
              </div>
            </div>
            <Switch
              id="allow-suggestions"
              checked={allowSuggestions}
              onCheckedChange={setAllowSuggestions}
            />
          </div>

          {/* Auto-approve Threshold */}
          {allowSuggestions && (
            <div className="space-y-4 p-4 rounded-lg bg-muted/50">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <Gauge className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <Label htmlFor="use-auto-approve" className="cursor-pointer">
                      Auto-approve by Votes
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Automatically add songs that reach the vote threshold
                    </p>
                  </div>
                </div>
                <Switch
                  id="use-auto-approve"
                  checked={useAutoApprove}
                  onCheckedChange={setUseAutoApprove}
                />
              </div>

              {useAutoApprove && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Required Votes</Label>
                    <span className="text-sm font-medium">+{autoApproveThreshold}</span>
                  </div>
                  <Slider
                    value={[autoApproveThreshold || 3]}
                    onValueChange={([v]) => setAutoApproveThreshold(v)}
                    min={1}
                    max={10}
                    step={1}
                  />
                  <p className="text-xs text-muted-foreground">
                    Songs with +{autoApproveThreshold} net votes will be automatically added
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleEnable} disabled={enableMutation.isPending}>
            {enableMutation.isPending ? "Enabling..." : "Enable Collaboration"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
