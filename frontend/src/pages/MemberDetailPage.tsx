import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCurrentTenant } from "@/hooks/useTenant";
import { useMember } from "@/hooks/useMembers";
import { MemberStatusBadge } from "@/components/members/MemberStatusBadge";
import { StatusChangeDialog } from "@/components/members/StatusChangeDialog";
import { ArchiveConfirmDialog } from "@/components/members/ArchiveConfirmDialog";
import { PaymentHistoryTable } from "@/components/payments/PaymentHistoryTable";
import { PaymentForm } from "@/components/payments/PaymentForm";
import { MemberStatus } from "@/types/member";
import type { ApiError } from "@/types/error";
import type { Payment } from "@/types/payment";

/**
 * Member Detail Page
 * Displays detailed information about a member with actions
 */
export function MemberDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: tenant, isLoading: tenantLoading } = useCurrentTenant();
  const {
    data: member,
    isLoading: memberLoading,
    error: memberError,
  } = useMember(tenant?.id || "", id || "");

  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentFormKey, setPaymentFormKey] = useState(0);
  const [correctionModalOpen, setCorrectionModalOpen] = useState(false);
  const [correctionFormKey, setCorrectionFormKey] = useState(0);
  const [selectedPaymentForCorrection, setSelectedPaymentForCorrection] =
    useState<Payment | null>(null);

  const formatDate = (dateString: string | null): string => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString("tr-TR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const formatDateTime = (dateString: string | null): string => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleString("tr-TR");
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
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {member.firstName} {member.lastName}
          </h1>
          <p className="text-sm text-muted-foreground">Üye Detayları</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to={`/members/${member.id}/edit`}>Düzenle</Link>
          </Button>
          {member.status !== MemberStatus.ARCHIVED && (
            <>
              <Button
                variant="outline"
                onClick={() => setStatusDialogOpen(true)}
              >
                Durumu Değiştir
              </Button>
              <Button
                variant="destructive"
                onClick={() => setArchiveDialogOpen(true)}
              >
                Arşivle
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Personal Information */}
        <Card>
          <CardHeader>
            <CardTitle>Kişisel Bilgiler</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">Ad Soyad</p>
              <p className="font-medium">
                {member.firstName} {member.lastName}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Telefon</p>
              <p className="font-medium">{member.phone}</p>
            </div>
            {member.email && (
              <div>
                <p className="text-sm text-muted-foreground">E-posta</p>
                <p className="font-medium">{member.email}</p>
              </div>
            )}
            {member.gender && (
              <div>
                <p className="text-sm text-muted-foreground">Cinsiyet</p>
                <p className="font-medium">
                  {member.gender === "MALE" ? "Erkek" : "Kadın"}
                </p>
              </div>
            )}
            {member.dateOfBirth && (
              <div>
                <p className="text-sm text-muted-foreground">Doğum Tarihi</p>
                <p className="font-medium">{formatDate(member.dateOfBirth)}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Membership Information */}
        <Card>
          <CardHeader>
            <CardTitle>Üyelik Bilgileri</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">Üyelik Planı</p>
              <p className="font-medium">
                {member.membershipPlan?.name || member.membershipPlanId || "-"}
              </p>
              {member.membershipPlan && (
                <p className="text-xs text-muted-foreground mt-1">
                  {member.membershipPlan.durationType === "DAYS"
                    ? `${member.membershipPlan.durationValue} gün`
                    : `${member.membershipPlan.durationValue} ay`}
                  {" - "}
                  {new Intl.NumberFormat("tr-TR", {
                    style: "currency",
                    currency: member.membershipPlan.currency,
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  }).format(member.membershipPlan.price)}
                </p>
              )}
            </div>
            {member.membershipPriceAtPurchase !== null && (
              <div>
                <p className="text-sm text-muted-foreground">
                  Satın Alma Fiyatı
                </p>
                <p className="font-medium">
                  {new Intl.NumberFormat("tr-TR", {
                    style: "currency",
                    currency: member.membershipPlan?.currency || "TRY",
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  }).format(member.membershipPriceAtPurchase)}
                </p>
              </div>
            )}
            <div>
              <p className="text-sm text-muted-foreground">Durum</p>
              <div className="mt-1">
                <MemberStatusBadge status={member.status} />
              </div>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Başlangıç Tarihi</p>
              <p className="font-medium">
                {formatDate(member.membershipStartDate)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Bitiş Tarihi</p>
              <p className="font-medium">
                {formatDate(member.membershipEndDate)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Kalan Gün</p>
              <p
                className={`font-medium ${
                  member.remainingDays >= 0
                    ? "text-green-600 dark:text-green-400"
                    : "text-red-600 dark:text-red-400"
                }`}
              >
                {member.remainingDays >= 0
                  ? `${member.remainingDays} gün`
                  : "Süresi dolmuş"}
              </p>
            </div>
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground">
                Not: Üyelik planı değişikliği v1 sürümünde desteklenmemektedir.
                Plan değişikliği için lütfen yeni bir üyelik oluşturun.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Notes */}
        {member.notes && (
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Notlar</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap">{member.notes}</p>
            </CardContent>
          </Card>
        )}

        {/* Timestamps */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Kayıt Bilgileri</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">Oluşturulma</p>
              <p className="font-medium">{formatDateTime(member.createdAt)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Son Güncelleme</p>
              <p className="font-medium">{formatDateTime(member.updatedAt)}</p>
            </div>
            {member.pausedAt && (
              <div>
                <p className="text-sm text-muted-foreground">
                  Dondurulma Tarihi
                </p>
                <p className="font-medium">{formatDateTime(member.pausedAt)}</p>
              </div>
            )}
            {member.resumedAt && (
              <div>
                <p className="text-sm text-muted-foreground">Devam Tarihi</p>
                <p className="font-medium">
                  {formatDateTime(member.resumedAt)}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tabs for Payment History */}
      <Card className="md:col-span-2">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Ödeme Geçmişi</CardTitle>
            <Button
              onClick={() => {
                setPaymentFormKey((prev) => prev + 1);
                setPaymentModalOpen(true);
              }}
            >
              Ödeme Kaydet
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="payments" className="w-full">
            <TabsList>
              <TabsTrigger value="payments">Ödeme Geçmişi</TabsTrigger>
            </TabsList>
            <TabsContent value="payments" className="mt-4">
              <PaymentHistoryTable
                tenantId={tenant.id}
                memberId={member.id}
                onCorrectPayment={(payment) => {
                  setSelectedPaymentForCorrection(payment);
                  setCorrectionFormKey((prev) => prev + 1);
                  setCorrectionModalOpen(true);
                }}
                onPaymentLinkClick={(paymentId) => {
                  // Payment detail route doesn't exist yet, show toast or handle gracefully
                  // TODO: Navigate to payment detail page when route is added
                  console.warn(`Payment detail route not implemented. Payment ID: ${paymentId}`);
                }}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Payment Recording Modal */}
      <Dialog open={paymentModalOpen} onOpenChange={setPaymentModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Ödeme Kaydet</DialogTitle>
          </DialogHeader>
          {paymentModalOpen && (
            <PaymentForm
              key={`create-${paymentFormKey}`}
              mode="create"
              initialMemberId={member.id}
              tenantId={tenant.id}
              onSubmit={() => {
                setPaymentModalOpen(false);
                // Payment history will refresh automatically via React Query cache invalidation
              }}
              onCancel={() => setPaymentModalOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Payment Correction Modal */}
      <Dialog open={correctionModalOpen} onOpenChange={setCorrectionModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Ödeme Düzelt</DialogTitle>
          </DialogHeader>
          {selectedPaymentForCorrection && correctionModalOpen && (
            <PaymentForm
              key={`correct-${selectedPaymentForCorrection.id}-${correctionFormKey}`}
              mode="correct"
              initialPayment={selectedPaymentForCorrection}
              tenantId={tenant.id}
              onSubmit={() => {
                setCorrectionModalOpen(false);
                setSelectedPaymentForCorrection(null);
                // Payment history will refresh automatically via React Query cache invalidation
              }}
              onCancel={() => {
                setCorrectionModalOpen(false);
                setSelectedPaymentForCorrection(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Status Change Dialog */}
      <StatusChangeDialog
        member={{
          id: member.id,
          firstName: member.firstName,
          lastName: member.lastName,
          status: member.status,
        }}
        open={statusDialogOpen}
        onOpenChange={setStatusDialogOpen}
        tenantId={tenant.id}
        onSuccess={() => {
          // Query will be invalidated automatically
        }}
      />

      {/* Archive Confirm Dialog */}
      <ArchiveConfirmDialog
        member={{
          id: member.id,
          firstName: member.firstName,
          lastName: member.lastName,
        }}
        open={archiveDialogOpen}
        onOpenChange={setArchiveDialogOpen}
        tenantId={tenant.id}
        onSuccess={() => {
          navigate("/members");
        }}
      />
    </div>
  );
}
