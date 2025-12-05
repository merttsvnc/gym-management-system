import { useState, useEffect } from "react"
import { useCurrentTenant } from "@/hooks/useTenant"
import {
  useBranches,
  useCreateBranch,
  useUpdateBranch,
  useArchiveBranch,
  useRestoreBranch,
  useSetDefaultBranch,
} from "@/hooks/useBranches"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import type { ApiError } from "@/types/error"
import type { Branch } from "@/types/branch"

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleString()
}

function NewBranchDialog({
  tenantId,
  onOpenChange,
}: {
  tenantId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const createBranch = useCreateBranch(tenantId)
  const [name, setName] = useState("")
  const [address, setAddress] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await createBranch.mutateAsync({ name, address })
      setName("")
      setAddress("")
      onOpenChange(false)
    } catch (err) {
      // Error handled by mutation state
    }
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Create New Branch</DialogTitle>
        <DialogDescription>
          Add a new branch to your tenant
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit}>
        <div className="space-y-4 py-4">
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
  )
}

function EditBranchDialog({
  branch,
  tenantId,
  open,
  onOpenChange,
}: {
  branch: Branch
  tenantId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const updateBranch = useUpdateBranch(tenantId)
  const [name, setName] = useState(branch.name)
  const [address, setAddress] = useState(branch.address)

  // Update form when branch changes
  useEffect(() => {
    if (branch) {
      setName(branch.name)
      setAddress(branch.address)
    }
  }, [branch])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await updateBranch.mutateAsync({
        branchId: branch.id,
        payload: { name, address },
      })
      onOpenChange(false)
    } catch (err) {
      // Error handled by mutation state
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Branch</DialogTitle>
          <DialogDescription>Update branch information</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
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
  )
}

export function BranchesPage() {
  const { data: tenant, isLoading: tenantLoading } = useCurrentTenant()
  const [includeArchived, setIncludeArchived] = useState(false)
  const [newBranchOpen, setNewBranchOpen] = useState(false)
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null)

  const {
    data: branchesData,
    isLoading: branchesLoading,
    error: branchesError,
  } = useBranches(tenant?.id || "", { includeArchived })

  const archiveBranch = useArchiveBranch(tenant?.id || "")
  const restoreBranch = useRestoreBranch(tenant?.id || "")
  const setDefaultBranch = useSetDefaultBranch(tenant?.id || "")

  const handleArchive = async (branchId: string) => {
    if (
      confirm("Are you sure you want to archive this branch? It can be restored later.")
    ) {
      try {
        await archiveBranch.mutateAsync(branchId)
      } catch (err) {
        // Error handled by mutation state
      }
    }
  }

  const handleRestore = async (branchId: string) => {
    try {
      await restoreBranch.mutateAsync(branchId)
    } catch (err) {
      // Error handled by mutation state
    }
  }

  const handleSetDefault = async (branchId: string) => {
    try {
      await setDefaultBranch.mutateAsync(branchId)
    } catch (err) {
      // Error handled by mutation state
    }
  }

  if (tenantLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Branches</CardTitle>
          <CardDescription>Loading tenant...</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (!tenant) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Tenant not found</AlertDescription>
      </Alert>
    )
  }

  if (branchesError) {
    const apiError = branchesError as ApiError
    return (
      <Alert variant="destructive">
        <AlertDescription>
          {apiError.message || "Failed to load branches"}
        </AlertDescription>
      </Alert>
    )
  }

  const branches = branchesData?.data || []
  const isLoading = branchesLoading

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Branches</CardTitle>
              <CardDescription>
                Manage branches for your tenant
              </CardDescription>
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={includeArchived}
                  onChange={(e) => setIncludeArchived(e.target.checked)}
                  className="rounded"
                />
                Show archived
              </label>
              <Dialog open={newBranchOpen} onOpenChange={setNewBranchOpen}>
                <DialogTrigger asChild>
                  <Button>New branch</Button>
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {branches.map((branch) => (
                  <TableRow key={branch.id}>
                    <TableCell className="font-medium">{branch.name}</TableCell>
                    <TableCell>{branch.address}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        {branch.isDefault && (
                          <Badge variant="default">Default</Badge>
                        )}
                        {branch.archivedAt ? (
                          <Badge variant="secondary">Archived</Badge>
                        ) : (
                          <Badge variant="outline">Active</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{formatDate(branch.createdAt)}</TableCell>
                    <TableCell>{formatDate(branch.updatedAt)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {!branch.archivedAt && !branch.isDefault && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSetDefault(branch.id)}
                            disabled={setDefaultBranch.isPending}
                          >
                            Set as default
                          </Button>
                        )}
                        {!branch.archivedAt && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setEditingBranch(branch)}
                            >
                              Edit
                            </Button>
                            {!branch.isDefault && (
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => handleArchive(branch.id)}
                                disabled={archiveBranch.isPending}
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
  )
}

