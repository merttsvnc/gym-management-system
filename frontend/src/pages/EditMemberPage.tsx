import { useParams, useNavigate } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useCurrentTenant } from "@/hooks/useTenant";
import { useMember, useUpdateMember } from "@/hooks/useMembers";
import { MemberForm } from "@/components/members/MemberForm";
import type { UpdateMemberPayload } from "@/types/member";
import type { ApiError } from "@/types/error";

/**
 * Edit Member Page
 * Form for editing an existing member
 */
export function EditMemberPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: tenant, isLoading: tenantLoading } = useCurrentTenant();
  const {
    data: member,
    isLoading: memberLoading,
    error: memberError,
  } = useMember(tenant?.id || "", id || "");
  const updateMember = useUpdateMember(tenant?.id || "");

  const handleSubmit = async (data: UpdateMemberPayload) => {
    if (!id) return;
    await updateMember.mutateAsync({ memberId: id, payload: data });
    // Redirect to member detail page on success
    navigate(`/members/${id}`);
  };

  if (tenantLoading || memberLoading) {
    return (
      <div className="space-y-6">
        <Card className="w-full">
          <CardHeader>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64 mt-2" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="space-y-6">
        <Alert variant="destructive">
          <AlertDescription>Salon bilgisi bulunamadı</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (memberError) {
    const apiError = memberError as ApiError;
    return (
      <div className="space-y-6">
        <Alert variant="destructive">
          <AlertDescription>
            {apiError.message || "Üye bilgisi yüklenirken bir hata oluştu"}
          </AlertDescription>
        </Alert>
        <Button onClick={() => navigate("/members")}>Üye Listesine Dön</Button>
      </div>
    );
  }

  if (!member) {
    return (
      <div className="space-y-6">
        <Alert>
          <AlertDescription>Üye bulunamadı</AlertDescription>
        </Alert>
        <Button onClick={() => navigate("/members")}>Üye Listesine Dön</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Üyeyi Düzenle</h1>
        <p className="text-sm text-muted-foreground">
          Üye bilgilerini güncelleyin.
        </p>
      </div>

      <Card className="w-full">
        <CardHeader>
          <CardTitle>Üye Bilgileri</CardTitle>
          <CardDescription>
            Üye bilgilerini düzenleyin ve kaydedin.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MemberForm
            mode="edit"
            initialData={member}
            onSubmit={handleSubmit}
            onCancel={() => navigate(`/members/${member.id}`)}
            isLoading={updateMember.isPending}
            error={updateMember.error}
            tenantId={tenant.id}
          />
        </CardContent>
      </Card>
    </div>
  );
}
