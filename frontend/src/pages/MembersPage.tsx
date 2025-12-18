import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCurrentTenant } from "@/hooks/useTenant";
import { useMembers } from "@/hooks/useMembers";
import { MemberList } from "@/components/members/MemberList";
import { MemberStatus } from "@/types/member";
import { useIsReadOnly } from "@/hooks/use-billing-status";
import { BILLING_TOOLTIP_MESSAGES } from "@/lib/constants/billing-messages";

/**
 * Member List Page
 * Displays paginated list of members with filters and search
 */
export function MembersPage() {
  const { data: tenant, isLoading: tenantLoading } = useCurrentTenant();
  const navigate = useNavigate();
  const isReadOnly = useIsReadOnly();
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<MemberStatus | "ALL">("ALL");
  const [membershipTypeFilter, setMembershipTypeFilter] = useState<
    string | "ALL"
  >("ALL");

  const {
    data: membersData,
    isLoading: membersLoading,
    error: membersError,
  } = useMembers(tenant?.id || "", {
    page,
    limit,
    ...(search && { search }),
    ...(statusFilter !== "ALL" && { status: statusFilter }),
    ...(membershipTypeFilter !== "ALL" && {
      membershipType: membershipTypeFilter,
    }),
    includeArchived: statusFilter === MemberStatus.ARCHIVED,
  });

  if (tenantLoading) {
    return (
      <div className="space-y-6">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Üyeler</CardTitle>
            <CardDescription>Yükleniyor...</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="space-y-6">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Üyeler</CardTitle>
            <CardDescription>Salon bilgisi bulunamadı</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const members = membersData?.data || [];
  const pagination = membersData?.pagination;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Üyeler</h1>
          <p className="text-sm text-muted-foreground">
            Üyelerinizi görüntüleyin ve yönetin.
          </p>
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  onClick={() => navigate("/members/new")}
                  disabled={isReadOnly}
                >
                  Yeni Üye
                </Button>
              </span>
            </TooltipTrigger>
            {isReadOnly && (
              <TooltipContent>
                <p>{BILLING_TOOLTIP_MESSAGES.PAST_DUE_READ_ONLY}</p>
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      </div>

      <Card className="w-full">
        <CardHeader>
          <CardTitle>Üye Listesi</CardTitle>
          <CardDescription>
            Tüm üyelerinizi buradan yönetebilirsiniz
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MemberList
            members={members}
            isLoading={membersLoading}
            error={membersError}
            search={search}
            onSearchChange={setSearch}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            membershipTypeFilter={membershipTypeFilter}
            onMembershipTypeFilterChange={setMembershipTypeFilter}
            readOnly={isReadOnly}
          />

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <div className="text-sm text-muted-foreground">
                Toplam {pagination.total} üye, Sayfa {pagination.page} /{" "}
                {pagination.totalPages}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1 || membersLoading}
                >
                  Önceki
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setPage((p) => Math.min(pagination.totalPages, p + 1))
                  }
                  disabled={page === pagination.totalPages || membersLoading}
                >
                  Sonraki
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
