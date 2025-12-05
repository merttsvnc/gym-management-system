import React, { useState } from "react";
import { useCurrentTenant } from "@/hooks/useTenant";
import {
  useBranches,
  useCreateBranch,
  useUpdateBranch,
  useArchiveBranch,
  useRestoreBranch,
  useSetDefaultBranch,
} from "@/hooks/useBranches";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ApiError } from "@/types/error";
import type { Branch } from "@/types/branch";

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleString();
}

function NewBranchDialog({
  tenantId,
  onOpenChange,
}: {
  tenantId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const createBranch = useCreateBranch(tenantId);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createBranch.mutateAsync({ name, address });
      setName("");
      setAddress("");
      onOpenChange(false);
    } catch {
      // Error handled by mutation state
    }
  };

  return (
    <DialogContent className="w-full sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Create New Branch</DialogTitle>
        <DialogDescription>Add a new branch to your tenant</DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit}>
        <div className="space-y-4 py-4 px-1">
          <div className="space-y-2">
            <Label htmlFor="branch-name">Name</Label>
            <Input
              id="branch-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter branch name"
              required
              minLength={2}
              maxLength={100}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="branch-address">Address</Label>
            <Input
              id="branch-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Enter branch address"
              required
              minLength={5}
              maxLength={300}
            />
          </div>
          {createBranch.error && (
            <Alert variant="destructive">
              <AlertDescription>
                {(createBranch.error as ApiError).message ||
                  "Failed to create branch"}
              </AlertDescription>
            </Alert>
          )}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={createBranch.isPending}>
            {createBranch.isPending ? "Creating..." : "Create"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function EditBranchDialog({
  branch,
  tenantId,
  open,
  onOpenChange,
}: {
  branch: Branch;
  tenantId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const updateBranch = useUpdateBranch(tenantId);
  const [name, setName] = useState(branch.name);
  const [address, setAddress] = useState(branch.address);

  // Reset form when dialog opens with different branch
  const branchId = branch.id;
  React.useEffect(() => {
    setName(branch.name);
    setAddress(branch.address);
  }, [branchId, branch.name, branch.address]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateBranch.mutateAsync({
        branchId: branch.id,
        payload: { name, address },
      });
      onOpenChange(false);
    } catch {
      // Error handled by mutation state
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Branch</DialogTitle>
          <DialogDescription>Update branch information</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4 px-1">
            <div className="space-y-2">
              <Label htmlFor="edit-branch-name">Name</Label>
              <Input
                id="edit-branch-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter branch name"
                required
                minLength={2}
                maxLength={100}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-branch-address">Address</Label>
              <Input
                id="edit-branch-address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Enter branch address"
                required
                minLength={5}
                maxLength={300}
              />
            </div>
            {updateBranch.error && (
              <Alert variant="destructive">
                <AlertDescription>
                  {(updateBranch.error as ApiError).message ||
                    "Failed to update branch"}
                </AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={updateBranch.isPending}>
              {updateBranch.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function BranchesPage() {
  const { data: tenant, isLoading: tenantLoading } = useCurrentTenant();
  const [includeArchived, setIncludeArchived] = useState(false);
  const [newBranchOpen, setNewBranchOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);

  const {
    data: branchesData,
    isLoading: branchesLoading,
    error: branchesError,
  } = useBranches(tenant?.id || "", { includeArchived });

  const archiveBranch = useArchiveBranch(tenant?.id || "");
  const restoreBranch = useRestoreBranch(tenant?.id || "");
  const setDefaultBranch = useSetDefaultBranch(tenant?.id || "");

  const handleArchive = async (branchId: string) => {
    if (
      confirm(
        "Are you sure you want to archive this branch? It can be restored later."
      )
    ) {
      try {
        await archiveBranch.mutateAsync(branchId);
      } catch {
        // Error handled by mutation state
      }
    }
  };

  const handleRestore = async (branchId: string) => {
    try {
      await restoreBranch.mutateAsync(branchId);
    } catch {
      // Error handled by mutation state
    }
  };

  const handleSetDefault = async (branchId: string) => {
    try {
      await setDefaultBranch.mutateAsync(branchId);
    } catch {
      // Error handled by mutation state
    }
  };

  if (tenantLoading) {
    return (
      <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Branches</CardTitle>
            <CardDescription>Loading tenant...</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Alert variant="destructive">
          <AlertDescription>Tenant not found</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (branchesError) {
    const apiError = branchesError as ApiError;
    return (
      <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Alert variant="destructive">
          <AlertDescription>
            {apiError.message || "Failed to load branches"}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const branches = branchesData?.data || [];
  const isLoading = branchesLoading;

  return (
    <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <Card className="w-full">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle>Branches</CardTitle>
              <CardDescription>Manage branches for your tenant</CardDescription>
            </div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
              <label
                htmlFor="show-archived-checkbox"
                className="flex items-center gap-2 text-sm cursor-pointer whitespace-nowrap"
              >
                <input
                  id="show-archived-checkbox"
                  type="checkbox"
                  checked={includeArchived}
                  onChange={(e) => setIncludeArchived(e.target.checked)}
                  className="rounded cursor-pointer"
                />
                Show archived
              </label>
              <Dialog open={newBranchOpen} onOpenChange={setNewBranchOpen}>
                <DialogTrigger asChild>
                  <Button className="w-full sm:w-auto">New branch</Button>
                </DialogTrigger>
                <NewBranchDialog
                  tenantId={tenant.id}
                  open={newBranchOpen}
                  onOpenChange={setNewBranchOpen}
                />
              </Dialog>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground">
              Loading branches...
            </div>
          ) : branches.length === 0 ? (
            <div className="py-8 text-center space-y-4">
              <p className="text-muted-foreground">
                {includeArchived
                  ? "No branches found"
                  : "No branches yet. Create your first branch to get started."}
              </p>
              {!includeArchived && (
                <Button onClick={() => setNewBranchOpen(true)}>
                  Create your first branch
                </Button>
              )}
            </div>
          ) : (
            <div className="w-full overflow-x-auto">
              <Table className="min-w-[700px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[200px]">Name</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead className="w-[150px]">Status</TableHead>
                    <TableHead className="w-[200px]">Created</TableHead>
                    <TableHead className="w-[200px]">Updated</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {branches.map((branch) => (
                    <TableRow key={branch.id}>
                      <TableCell className="font-medium">{branch.name}</TableCell>
                      <TableCell className="max-w-[300px] truncate" title={branch.address}>
                        {branch.address}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2 flex-wrap">
                          {branch.isDefault && (
                            <Badge variant="default" className="bg-primary text-primary-foreground hover:bg-primary/90 whitespace-nowrap">Default</Badge>
                          )}
                          {branch.archivedAt ? (
                            <Badge variant="secondary" className="bg-muted text-muted-foreground whitespace-nowrap">Archived</Badge>
                          ) : (
                            <Badge variant="outline" className="border-primary/20 text-primary whitespace-nowrap">Active</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground text-sm">{formatDate(branch.createdAt)}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground text-sm">{formatDate(branch.updatedAt)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2 items-center flex-wrap">
                          {!branch.archivedAt && !branch.isDefault && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleSetDefault(branch.id)}
                              disabled={setDefaultBranch.isPending}
                              className="h-8 text-xs sm:text-sm whitespace-nowrap"
                            >
                              Set Default
                            </Button>
                          )}
                          {!branch.archivedAt && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setEditingBranch(branch)}
                                className="h-8 text-xs sm:text-sm whitespace-nowrap"
                              >
                                Edit
                              </Button>
                              {!branch.isDefault && (
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => handleArchive(branch.id)}
                                  disabled={archiveBranch.isPending}
                                  className="h-8 text-xs sm:text-sm whitespace-nowrap"
                                >
                                  Archive
                                </Button>
                              )}
                            </>
                          )}
                          {branch.archivedAt && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleRestore(branch.id)}
                              disabled={restoreBranch.isPending}
                              className="h-8 text-xs sm:text-sm whitespace-nowrap"
                            >
                              Restore
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {editingBranch && (
        <EditBranchDialog
          branch={editingBranch}
          tenantId={tenant.id}
          open={!!editingBranch}
          onOpenChange={(open) => !open && setEditingBranch(null)}
        />
      )}
    </div>
  );
}
