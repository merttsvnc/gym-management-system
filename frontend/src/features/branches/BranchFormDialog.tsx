import React, { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useCreateBranch, useUpdateBranch } from "@/hooks/useBranches";
import type { ApiError } from "@/types/error";
import type { Branch } from "@/types/branch";

interface BranchFormDialogProps {
  mode: "create" | "edit";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  initialData?: Branch;
  onSuccess?: () => void;
}

function BranchFormContent({
  mode,
  onOpenChange,
  tenantId,
  initialData,
  onSuccess,
}: Omit<BranchFormDialogProps, "open">) {
  const createBranch = useCreateBranch(tenantId);
  const updateBranch = useUpdateBranch(tenantId);

  // Initialize form state based on mode and initialData
  const initialName = mode === "edit" && initialData ? initialData.name : "";
  const initialAddress =
    mode === "edit" && initialData ? initialData.address : "";

  const [name, setName] = useState(initialName);
  const [address, setAddress] = useState(initialAddress);
  const [errors, setErrors] = useState<{ name?: string; address?: string }>({});

  const validateForm = (): boolean => {
    const newErrors: { name?: string; address?: string } = {};

    if (!name || name.trim().length < 2) {
      newErrors.name = "Şube adı en az 2 karakter olmalıdır.";
    } else if (name.length > 100) {
      newErrors.name = "Şube adı en fazla 100 karakter olabilir.";
    }

    if (!address || address.trim().length < 5) {
      newErrors.address = "Adres en az 5 karakter olmalıdır.";
    } else if (address.length > 300) {
      newErrors.address = "Adres en fazla 300 karakter olabilir.";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      if (mode === "create") {
        await createBranch.mutateAsync({
          name: name.trim(),
          address: address.trim(),
        });
        toast.success("Şube başarıyla oluşturuldu");
      } else if (initialData) {
        await updateBranch.mutateAsync({
          branchId: initialData.id,
          payload: { name: name.trim(), address: address.trim() },
        });
        toast.success("Şube başarıyla güncellendi");
      }

      // Reset form state
      setName("");
      setAddress("");
      setErrors({});

      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      // Check if it's a plan-limit specific error
      const apiError = error as ApiError;
      if (
        apiError.statusCode === 403 ||
        (apiError.statusCode === 400 &&
          apiError.message?.toLowerCase().includes("plan"))
      ) {
        // Show specific plan-limit error
        // Global handler already shows a toast, but we keep the dialog open
        // so the user can see the error in context
      } else if (apiError.statusCode === 400) {
        // Handle validation errors from backend
        // The error message should be displayed in the Alert component below
        console.error("Validation error:", apiError.message);
      } else {
        // Other errors are handled by mutation state and global handler
        console.error("Unexpected error:", error);
      }
    }
  };

  const isPending =
    mode === "create" ? createBranch.isPending : updateBranch.isPending;
  const error = mode === "create" ? createBranch.error : updateBranch.error;

  return (
    <>
      <DialogContent className="w-full sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Yeni Şube" : "Şubeyi Düzenle"}
          </DialogTitle>
          <DialogDescription>
            Şube adını ve adresini girerek şube bilgilerini yönetin.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4 px-1">
            <div className="space-y-2">
              <Label htmlFor="branch-name">
                Şube Adı <span className="text-destructive">*</span>
              </Label>
              <Input
                id="branch-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (errors.name) setErrors({ ...errors, name: undefined });
                }}
                placeholder="Örn: İstanbul Merkez Şubesi"
                className={errors.name ? "border-destructive" : ""}
              />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="branch-address">
                Adres <span className="text-destructive">*</span>
              </Label>
              <Input
                id="branch-address"
                value={address}
                onChange={(e) => {
                  setAddress(e.target.value);
                  if (errors.address)
                    setErrors({ ...errors, address: undefined });
                }}
                placeholder="Örn: İstiklal Caddesi No: 5, Beyoğlu"
                className={errors.address ? "border-destructive" : ""}
              />
              {errors.address && (
                <p className="text-sm text-destructive">{errors.address}</p>
              )}
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>
                  {(error as ApiError).message ||
                    "Şube kaydedilirken bir hata oluştu. Lütfen tekrar deneyin."}
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
            <Button type="submit" disabled={isPending}>
              {isPending
                ? mode === "create"
                  ? "Oluşturuluyor..."
                  : "Güncelleniyor..."
                : mode === "create"
                ? "Oluştur"
                : "Güncelle"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </>
  );
}

export function BranchFormDialog({
  mode,
  open,
  onOpenChange,
  tenantId,
  initialData,
  onSuccess,
}: BranchFormDialogProps) {
  // Use key to force remount when switching between create/edit or different branches
  const dialogKey = mode === "create" ? "create" : `edit-${initialData?.id}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <BranchFormContent
        key={dialogKey}
        mode={mode}
        onOpenChange={onOpenChange}
        tenantId={tenantId}
        initialData={initialData}
        onSuccess={onSuccess}
      />
    </Dialog>
  );
}
