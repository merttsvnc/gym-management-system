import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useArchiveMember } from "@/hooks/useMembers";
import type { ApiError } from "@/types/error";

interface ArchiveConfirmDialogProps {
  member: {
    id: string;
    firstName: string;
    lastName: string;
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  onSuccess?: () => void;
}

/**
 * Dialog component for confirming member archive action
 */
export function ArchiveConfirmDialog({
  member,
  open,
  onOpenChange,
  tenantId,
  onSuccess,
}: ArchiveConfirmDialogProps) {
  const archiveMember = useArchiveMember(tenantId);

  const handleConfirm = async () => {
    try {
      await archiveMember.mutateAsync(member.id);
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      // Error handled by mutation and global interceptor
      console.error("Archive error:", error);
    }
  };

  const isPending = archiveMember.isPending;
  const error = archiveMember.error;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Üyeyi Arşivle</DialogTitle>
          <DialogDescription>
            Bu üyeyi arşivlemek istediğinizden emin misiniz? Arşivlenen üyeler
            varsayılan listelerde görünmez ancak daha sonra görüntülenebilir.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <p className="text-sm text-muted-foreground">
            <strong>
              {member.firstName} {member.lastName}
            </strong>{" "}
            adlı üye arşivlenecek.
          </p>

          {error && (
            <Alert variant="destructive" className="mt-4">
              <AlertDescription>
                {(error as ApiError).message ||
                  "Üye arşivlenirken bir hata oluştu. Lütfen tekrar deneyin."}
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
            type="button"
            variant="destructive"
            onClick={handleConfirm}
            disabled={isPending}
          >
            {isPending ? "Arşivleniyor..." : "Evet, Arşivle"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
