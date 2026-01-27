import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useChangeMemberStatus } from "@/hooks/useMembers";
import { MemberStatus } from "@/types/member";
import { MemberWorkflowStatusBadge } from "./MemberWorkflowStatusBadge";
import type { ApiError } from "@/types/error";

interface StatusChangeDialogProps {
  member: {
    id: string;
    firstName: string;
    lastName: string;
    status: MemberStatus;
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  onSuccess?: () => void;
}

/**
 * Available status options (excluding ARCHIVED - use archive endpoint for that)
 */
const AVAILABLE_STATUSES = [
  { value: MemberStatus.ACTIVE, label: "Aktif" },
  { value: MemberStatus.PAUSED, label: "Dondurulmuş" },
  { value: MemberStatus.INACTIVE, label: "Pasif" },
] as const;

/**
 * Dialog component for changing member status
 */
export function StatusChangeDialog({
  member,
  open,
  onOpenChange,
  tenantId,
  onSuccess,
}: StatusChangeDialogProps) {
  const [selectedStatus, setSelectedStatus] = useState<MemberStatus>(
    member.status
  );
  const changeStatus = useChangeMemberStatus(tenantId);

  // Reset selected status when member changes
  useEffect(() => {
    if (open) {
      const resetStatus = () => {
        setSelectedStatus(member.status);
      };
      resetStatus();
    }
  }, [member.status, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (selectedStatus === member.status) {
      onOpenChange(false);
      return;
    }

    try {
      await changeStatus.mutateAsync({
        memberId: member.id,
        payload: { status: selectedStatus },
      });
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      // Error handled by mutation and global interceptor
      console.error("Status change error:", error);
    }
  };

  const isPending = changeStatus.isPending;
  const error = changeStatus.error;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Üye Durumunu Değiştir</DialogTitle>
          <DialogDescription>
            {member.firstName} {member.lastName} için durum değişikliği yapın.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Mevcut Durum</Label>
              <div>
                <MemberWorkflowStatusBadge status={member.status} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-status">
                Yeni Durum <span className="text-destructive">*</span>
              </Label>
              <Select
                value={selectedStatus}
                onValueChange={(value) =>
                  setSelectedStatus(value as MemberStatus)
                }
                disabled={isPending}
              >
                <SelectTrigger id="new-status">
                  <SelectValue placeholder="Durum seçin" />
                </SelectTrigger>
                <SelectContent>
                  {AVAILABLE_STATUSES.map((status) => (
                    <SelectItem key={status.value} value={status.value}>
                      {status.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>
                  {(error as ApiError).message ||
                    "Durum değiştirilirken bir hata oluştu. Lütfen tekrar deneyin."}
                </AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              İptal
            </Button>
            <Button
              type="submit"
              disabled={isPending || selectedStatus === member.status}
            >
              {isPending ? "Kaydediliyor..." : "Kaydet"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
