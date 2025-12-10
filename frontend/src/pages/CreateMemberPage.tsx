import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useCurrentTenant } from '@/hooks/useTenant';
import { useCreateMember } from '@/hooks/useMembers';
import { MemberForm } from '@/components/members/MemberForm';
import type { CreateMemberPayload } from '@/types/member';

/**
 * Create Member Page
 * Form for creating a new member
 */
export function CreateMemberPage() {
  const { data: tenant, isLoading: tenantLoading } = useCurrentTenant();
  const navigate = useNavigate();
  const createMember = useCreateMember(tenant?.id || '');

  const handleSubmit = async (data: CreateMemberPayload) => {
    await createMember.mutateAsync(data);
    // Redirect to members list on success
    navigate('/members');
  };

  if (tenantLoading) {
    return (
      <div className="space-y-6">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Yeni Üye</CardTitle>
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
            <CardTitle>Yeni Üye</CardTitle>
            <CardDescription>Salon bilgisi bulunamadı</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Yeni Üye</h1>
        <p className="text-sm text-muted-foreground">
          Yeni bir üye ekleyin.
        </p>
      </div>

      <Card className="w-full">
        <CardHeader>
          <CardTitle>Üye Bilgileri</CardTitle>
          <CardDescription>
            Üye bilgilerini doldurun ve kaydedin.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MemberForm
            mode="create"
            onSubmit={handleSubmit}
            onCancel={() => navigate('/members')}
            isLoading={createMember.isPending}
            error={createMember.error}
            tenantId={tenant.id}
          />
        </CardContent>
      </Card>
    </div>
  );
}

