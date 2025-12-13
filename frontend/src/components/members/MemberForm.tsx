import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PlanSelector } from "@/components/membership-plans/PlanSelector";
import { DurationPreview } from "@/components/membership-plans/DurationPreview";
import { useBranches } from "@/hooks/useBranches";
import { useActivePlans } from "@/hooks/use-membership-plans";
import { MemberGender } from "@/types/member";
import type {
  Member,
  CreateMemberPayload,
  UpdateMemberPayload,
} from "@/types/member";
import type { ApiError } from "@/types/error";

interface MemberFormProps {
  mode: "create" | "edit";
  initialData?: Member;
  onSubmit: (data: CreateMemberPayload | UpdateMemberPayload) => Promise<void>;
  onCancel?: () => void;
  isLoading?: boolean;
  error?: ApiError | null;
  tenantId: string;
}

/**
 * Form component for creating/editing members
 */
export function MemberForm({
  mode,
  initialData,
  onSubmit,
  onCancel,
  isLoading = false,
  error,
  tenantId,
}: MemberFormProps) {
  const { data: branchesData } = useBranches(tenantId);
  const branches = branchesData?.data || [];
  const { data: plans } = useActivePlans(tenantId);

  // Get today's date in YYYY-MM-DD format for default
  const today = new Date().toISOString().split("T")[0];

  // Form state
  const [branchId, setBranchId] = useState(initialData?.branchId || "");
  const [firstName, setFirstName] = useState(initialData?.firstName || "");
  const [lastName, setLastName] = useState(initialData?.lastName || "");
  const [phone, setPhone] = useState(initialData?.phone || "");
  const [email, setEmail] = useState(initialData?.email || "");
  const [gender, setGender] = useState<MemberGender | "">(
    initialData?.gender || ""
  );
  const [dateOfBirth, setDateOfBirth] = useState(
    initialData?.dateOfBirth ? initialData.dateOfBirth.split("T")[0] : ""
  );
  const [membershipPlanId, setMembershipPlanId] = useState(
    initialData?.membershipPlanId || ""
  );
  const [membershipStartDate, setMembershipStartDate] = useState(
    initialData?.membershipStartDate
      ? initialData.membershipStartDate.split("T")[0]
      : today
  );
  const [notes, setNotes] = useState(initialData?.notes || "");

  // Get selected plan for DurationPreview
  const selectedPlan = plans?.find((p) => p.id === membershipPlanId) || null;
  const startDateForPreview = membershipStartDate
    ? new Date(membershipStartDate)
    : null;

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Reset form when initialData changes
  useEffect(() => {
    if (initialData) {
      const updateFormData = () => {
        setBranchId(initialData.branchId);
        setFirstName(initialData.firstName);
        setLastName(initialData.lastName);
        setPhone(initialData.phone);
        setEmail(initialData.email || "");
        setGender(initialData.gender || "");
        setDateOfBirth(
          initialData.dateOfBirth ? initialData.dateOfBirth.split("T")[0] : ""
        );
        setMembershipPlanId(initialData.membershipPlanId || "");
        setMembershipStartDate(
          initialData.membershipStartDate
            ? initialData.membershipStartDate.split("T")[0]
            : today
        );
        setNotes(initialData.notes || "");
      };
      updateFormData();
    }
  }, [initialData, today]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!branchId.trim()) {
      newErrors.branchId = "Şube seçimi zorunludur";
    }

    if (!firstName.trim()) {
      newErrors.firstName = "Ad zorunludur";
    } else if (firstName.trim().length > 50) {
      newErrors.firstName = "Ad en fazla 50 karakter olabilir";
    }

    if (!lastName.trim()) {
      newErrors.lastName = "Soyad zorunludur";
    } else if (lastName.trim().length > 50) {
      newErrors.lastName = "Soyad en fazla 50 karakter olabilir";
    }

    if (!phone.trim()) {
      newErrors.phone = "Telefon numarası zorunludur";
    } else if (phone.trim().length < 10) {
      newErrors.phone = "Telefon numarası en az 10 haneli olmalıdır";
    } else if (phone.trim().length > 20) {
      newErrors.phone = "Telefon numarası en fazla 20 karakter olabilir";
    }

    if (email && email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        newErrors.email = "Geçerli bir e-posta adresi girin";
      }
    }

    if (mode === "create" && !membershipPlanId.trim()) {
      newErrors.membershipPlanId = "Üyelik planı seçimi zorunludur";
    }

    if (notes && notes.length > 5000) {
      newErrors.notes = "Notlar en fazla 5000 karakter olabilir";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    const payload: CreateMemberPayload | UpdateMemberPayload = {
      ...(mode === "create" && { branchId: branchId.trim() }),
      ...(mode === "edit" &&
        branchId !== initialData?.branchId && { branchId: branchId.trim() }),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: phone.trim(),
      ...(email.trim() && { email: email.trim() }),
      ...(gender && { gender: gender as MemberGender }),
      ...(dateOfBirth && { dateOfBirth }),
      ...(mode === "create" && { membershipPlanId: membershipPlanId.trim() }),
      ...(membershipStartDate && {
        membershipStartDate: new Date(membershipStartDate).toISOString(),
      }),
      ...(notes.trim() && { notes: notes.trim() }),
    };

    try {
      await onSubmit(payload);
    } catch (err) {
      // Error handled by parent component
      console.error("Form submission error:", err);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Branch Selection (only for create mode) */}
        {mode === "create" && (
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="branchId">
              Şube <span className="text-destructive">*</span>
            </Label>
            <Select
              value={branchId}
              onValueChange={(value) => {
                setBranchId(value);
                if (errors.branchId) setErrors({ ...errors, branchId: "" });
              }}
              disabled={isLoading}
            >
              <SelectTrigger
                id="branchId"
                className={errors.branchId ? "border-destructive" : ""}
              >
                <SelectValue placeholder="Şube seçin" />
              </SelectTrigger>
              <SelectContent>
                {branches
                  .filter((branch) => branch.isActive && !branch.archivedAt)
                  .map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {errors.branchId && (
              <p className="text-sm text-destructive">{errors.branchId}</p>
            )}
          </div>
        )}

        {/* First Name */}
        <div className="space-y-2">
          <Label htmlFor="firstName">
            Ad <span className="text-destructive">*</span>
          </Label>
          <Input
            id="firstName"
            value={firstName}
            onChange={(e) => {
              setFirstName(e.target.value);
              if (errors.firstName) setErrors({ ...errors, firstName: "" });
            }}
            placeholder="Ad"
            className={errors.firstName ? "border-destructive" : ""}
            disabled={isLoading}
          />
          {errors.firstName && (
            <p className="text-sm text-destructive">{errors.firstName}</p>
          )}
        </div>

        {/* Last Name */}
        <div className="space-y-2">
          <Label htmlFor="lastName">
            Soyad <span className="text-destructive">*</span>
          </Label>
          <Input
            id="lastName"
            value={lastName}
            onChange={(e) => {
              setLastName(e.target.value);
              if (errors.lastName) setErrors({ ...errors, lastName: "" });
            }}
            placeholder="Soyad"
            className={errors.lastName ? "border-destructive" : ""}
            disabled={isLoading}
          />
          {errors.lastName && (
            <p className="text-sm text-destructive">{errors.lastName}</p>
          )}
        </div>

        {/* Phone */}
        <div className="space-y-2">
          <Label htmlFor="phone">
            Telefon <span className="text-destructive">*</span>
          </Label>
          <Input
            id="phone"
            type="tel"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              if (errors.phone) setErrors({ ...errors, phone: "" });
            }}
            placeholder="+90 555 123 4567"
            className={errors.phone ? "border-destructive" : ""}
            disabled={isLoading}
          />
          {errors.phone && (
            <p className="text-sm text-destructive">{errors.phone}</p>
          )}
        </div>

        {/* Email */}
        <div className="space-y-2">
          <Label htmlFor="email">E-posta</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (errors.email) setErrors({ ...errors, email: "" });
            }}
            placeholder="ornek@email.com"
            className={errors.email ? "border-destructive" : ""}
            disabled={isLoading}
          />
          {errors.email && (
            <p className="text-sm text-destructive">{errors.email}</p>
          )}
        </div>

        {/* Gender */}
        <div className="space-y-2">
          <Label htmlFor="gender">Cinsiyet</Label>
          <Select
            value={gender}
            onValueChange={(value) => {
              setGender(value as MemberGender | "");
              if (errors.gender) setErrors({ ...errors, gender: "" });
            }}
            disabled={isLoading}
          >
            <SelectTrigger id="gender">
              <SelectValue placeholder="Cinsiyet seçin" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={MemberGender.MALE}>Erkek</SelectItem>
              <SelectItem value={MemberGender.FEMALE}>Kadın</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Date of Birth */}
        <div className="space-y-2">
          <Label htmlFor="dateOfBirth">Doğum Tarihi</Label>
          <Input
            id="dateOfBirth"
            type="date"
            value={dateOfBirth}
            onChange={(e) => {
              setDateOfBirth(e.target.value);
              if (errors.dateOfBirth) setErrors({ ...errors, dateOfBirth: "" });
            }}
            className={errors.dateOfBirth ? "border-destructive" : ""}
            disabled={isLoading}
          />
          {errors.dateOfBirth && (
            <p className="text-sm text-destructive">{errors.dateOfBirth}</p>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {/* Membership Plan (only for create mode) */}
        {mode === "create" && (
          <div className="space-y-2">
            <Label htmlFor="membershipPlanId">
              Üyelik Planı <span className="text-destructive">*</span>
            </Label>
            <PlanSelector
              tenantId={tenantId}
              value={membershipPlanId}
              onValueChange={(value) => {
                setMembershipPlanId(value);
                if (errors.membershipPlanId)
                  setErrors({ ...errors, membershipPlanId: "" });
              }}
              disabled={isLoading}
            />
            {errors.membershipPlanId && (
              <p className="text-sm text-destructive">
                {errors.membershipPlanId}
              </p>
            )}
          </div>
        )}

        {/* Membership Start Date */}
        <div className="space-y-2">
          <Label htmlFor="membershipStartDate">Üyelik Başlangıç Tarihi</Label>
          <Input
            id="membershipStartDate"
            type="date"
            value={membershipStartDate}
            onChange={(e) => {
              setMembershipStartDate(e.target.value);
              if (errors.membershipStartDate)
                setErrors({ ...errors, membershipStartDate: "" });
            }}
            className={errors.membershipStartDate ? "border-destructive" : ""}
            disabled={isLoading}
          />
          {errors.membershipStartDate && (
            <p className="text-sm text-destructive">
              {errors.membershipStartDate}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Boş bırakılırsa bugünün tarihi kullanılır
          </p>
        </div>

        {/* Duration Preview (only for create mode with plan selected) */}
        {mode === "create" && selectedPlan && startDateForPreview && (
          <DurationPreview
            startDate={startDateForPreview}
            plan={selectedPlan}
          />
        )}

        {/* Notes */}
        <div className="space-y-2">
          <Label htmlFor="notes">Notlar</Label>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              if (errors.notes) setErrors({ ...errors, notes: "" });
            }}
            placeholder="Üye hakkında notlar..."
            rows={4}
            className={errors.notes ? "border-destructive" : ""}
            disabled={isLoading}
          />
          {errors.notes && (
            <p className="text-sm text-destructive">{errors.notes}</p>
          )}
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            {error.message ||
              "Form gönderilirken bir hata oluştu. Lütfen tekrar deneyin."}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isLoading}
          >
            İptal
          </Button>
        )}
        <Button type="submit" disabled={isLoading}>
          {isLoading
            ? "Kaydediliyor..."
            : mode === "create"
            ? "Kaydet"
            : "Güncelle"}
        </Button>
      </div>
    </form>
  );
}
