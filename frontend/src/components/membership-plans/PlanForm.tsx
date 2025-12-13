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
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  DurationType,
  type MembershipPlan,
  type CreatePlanPayload,
  type UpdatePlanPayload,
} from "@/types/membership-plan";
import type { ApiError } from "@/types/error";

interface PlanFormProps {
  mode: "create" | "edit";
  initialData?: MembershipPlan;
  onSubmit: (data: CreatePlanPayload | UpdatePlanPayload) => Promise<void>;
  onCancel?: () => void;
  isLoading?: boolean;
  error?: ApiError | null;
}

/**
 * Form component for creating/editing membership plans
 * Reusable form for create/edit with all plan fields and validation
 */
export function PlanForm({
  mode,
  initialData,
  onSubmit,
  onCancel,
  isLoading = false,
  error,
}: PlanFormProps) {
  // Form state
  const [name, setName] = useState(initialData?.name || "");
  const [description, setDescription] = useState(
    initialData?.description || ""
  );
  const [durationType, setDurationType] = useState<DurationType>(
    initialData?.durationType || DurationType.MONTHS
  );
  const [durationValue, setDurationValue] = useState(
    initialData?.durationValue?.toString() || "12"
  );
  const [price, setPrice] = useState(initialData?.price?.toString() || "0");
  const [currency, setCurrency] = useState(initialData?.currency || "TRY");
  const [maxFreezeDays, setMaxFreezeDays] = useState(
    initialData?.maxFreezeDays?.toString() || ""
  );
  const [autoRenew, setAutoRenew] = useState(initialData?.autoRenew || false);
  const [sortOrder, setSortOrder] = useState(
    initialData?.sortOrder?.toString() || ""
  );

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Reset form when initialData changes (e.g., when editing a different plan)
  // This pattern is intentional for form synchronization
  useEffect(() => {
    if (initialData) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional form reset on data change
      setName(initialData.name);
      setDescription(initialData.description || "");
      setDurationType(initialData.durationType);
      setDurationValue(initialData.durationValue.toString());
      setPrice(initialData.price.toString());
      setCurrency(initialData.currency);
      setMaxFreezeDays(initialData.maxFreezeDays?.toString() || "");
      setAutoRenew(initialData.autoRenew);
      setSortOrder(initialData.sortOrder?.toString() || "");
    }
  }, [initialData]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!name.trim()) {
      newErrors.name = "Plan adı zorunludur";
    } else if (name.trim().length > 100) {
      newErrors.name = "Plan adı en fazla 100 karakter olabilir";
    }

    if (description && description.length > 1000) {
      newErrors.description = "Açıklama en fazla 1000 karakter olabilir";
    }

    if (!durationValue) {
      newErrors.durationValue = "Süre değeri zorunludur";
    } else {
      const durationNum = parseInt(durationValue, 10);
      if (isNaN(durationNum) || durationNum <= 0) {
        newErrors.durationValue = "Süre değeri pozitif bir sayı olmalıdır";
      } else if (
        durationType === DurationType.DAYS &&
        (durationNum < 1 || durationNum > 730)
      ) {
        newErrors.durationValue = "Gün sayısı 1 ile 730 arasında olmalıdır";
      } else if (
        durationType === DurationType.MONTHS &&
        (durationNum < 1 || durationNum > 24)
      ) {
        newErrors.durationValue = "Ay sayısı 1 ile 24 arasında olmalıdır";
      }
    }

    if (!price) {
      newErrors.price = "Fiyat zorunludur";
    } else {
      const priceNum = parseFloat(price);
      if (isNaN(priceNum) || priceNum < 0) {
        newErrors.price = "Fiyat 0 veya daha büyük olmalıdır";
      }
    }

    if (!currency.trim()) {
      newErrors.currency = "Para birimi zorunludur";
    } else if (!/^[A-Z]{3}$/.test(currency.trim())) {
      newErrors.currency =
        "Para birimi 3 büyük harf olmalıdır (örn: TRY, USD, EUR)";
    }

    if (maxFreezeDays && maxFreezeDays.trim()) {
      const freezeNum = parseInt(maxFreezeDays, 10);
      if (isNaN(freezeNum) || freezeNum < 0) {
        newErrors.maxFreezeDays = "Dondurma günü 0 veya daha büyük olmalıdır";
      }
    }

    if (sortOrder && sortOrder.trim()) {
      const sortNum = parseInt(sortOrder, 10);
      if (isNaN(sortNum)) {
        newErrors.sortOrder = "Sıralama değeri bir sayı olmalıdır";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    const payload: CreatePlanPayload | UpdatePlanPayload = {
      name: name.trim(),
      ...(description.trim() && { description: description.trim() }),
      durationType,
      durationValue: parseInt(durationValue, 10),
      price: parseFloat(price),
      currency: currency.trim().toUpperCase(),
      ...(maxFreezeDays.trim() && {
        maxFreezeDays: parseInt(maxFreezeDays, 10),
      }),
      autoRenew,
      ...(sortOrder.trim() && { sortOrder: parseInt(sortOrder, 10) }),
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
        {/* Plan Name */}
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="name">
            Plan Adı <span className="text-destructive">*</span>
          </Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (errors.name) setErrors({ ...errors, name: "" });
            }}
            placeholder="Örn: Temel 1 Aylık Plan"
            className={errors.name ? "border-destructive" : ""}
            disabled={isLoading}
          />
          {errors.name && (
            <p className="text-sm text-destructive">{errors.name}</p>
          )}
        </div>

        {/* Description */}
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="description">Açıklama</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              if (errors.description) setErrors({ ...errors, description: "" });
            }}
            placeholder="Plan hakkında açıklama..."
            rows={3}
            className={errors.description ? "border-destructive" : ""}
            disabled={isLoading}
          />
          {errors.description && (
            <p className="text-sm text-destructive">{errors.description}</p>
          )}
        </div>

        {/* Duration Type */}
        <div className="space-y-2">
          <Label htmlFor="durationType">
            Süre Tipi <span className="text-destructive">*</span>
          </Label>
          <Select
            value={durationType}
            onValueChange={(value) => {
              setDurationType(value as DurationType);
              if (errors.durationType)
                setErrors({ ...errors, durationType: "" });
            }}
            disabled={isLoading}
          >
            <SelectTrigger id="durationType">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={DurationType.DAYS}>Gün</SelectItem>
              <SelectItem value={DurationType.MONTHS}>Ay</SelectItem>
            </SelectContent>
          </Select>
          {errors.durationType && (
            <p className="text-sm text-destructive">{errors.durationType}</p>
          )}
        </div>

        {/* Duration Value */}
        <div className="space-y-2">
          <Label htmlFor="durationValue">
            Süre Değeri <span className="text-destructive">*</span>
          </Label>
          <Input
            id="durationValue"
            type="number"
            value={durationValue}
            onChange={(e) => {
              setDurationValue(e.target.value);
              if (errors.durationValue)
                setErrors({ ...errors, durationValue: "" });
            }}
            placeholder={durationType === DurationType.DAYS ? "1-730" : "1-24"}
            min={1}
            max={durationType === DurationType.DAYS ? 730 : 24}
            className={errors.durationValue ? "border-destructive" : ""}
            disabled={isLoading}
          />
          {errors.durationValue && (
            <p className="text-sm text-destructive">{errors.durationValue}</p>
          )}
          <p className="text-xs text-muted-foreground">
            {durationType === DurationType.DAYS
              ? "1 ile 730 gün arasında"
              : "1 ile 24 ay arasında"}
          </p>
        </div>

        {/* Price */}
        <div className="space-y-2">
          <Label htmlFor="price">
            Fiyat <span className="text-destructive">*</span>
          </Label>
          <Input
            id="price"
            type="number"
            step="0.01"
            value={price}
            onChange={(e) => {
              setPrice(e.target.value);
              if (errors.price) setErrors({ ...errors, price: "" });
            }}
            placeholder="0.00"
            min="0"
            className={errors.price ? "border-destructive" : ""}
            disabled={isLoading}
          />
          {errors.price && (
            <p className="text-sm text-destructive">{errors.price}</p>
          )}
        </div>

        {/* Currency */}
        <div className="space-y-2">
          <Label htmlFor="currency">
            Para Birimi <span className="text-destructive">*</span>
          </Label>
          <Input
            id="currency"
            value={currency}
            onChange={(e) => {
              setCurrency(e.target.value.toUpperCase());
              if (errors.currency) setErrors({ ...errors, currency: "" });
            }}
            placeholder="TRY"
            maxLength={3}
            className={errors.currency ? "border-destructive" : ""}
            disabled={isLoading}
          />
          {errors.currency && (
            <p className="text-sm text-destructive">{errors.currency}</p>
          )}
          <p className="text-xs text-muted-foreground">
            ISO 4217 formatı (örn: TRY, USD, EUR)
          </p>
        </div>

        {/* Max Freeze Days */}
        <div className="space-y-2">
          <Label htmlFor="maxFreezeDays">Maksimum Dondurma Günü</Label>
          <Input
            id="maxFreezeDays"
            type="number"
            value={maxFreezeDays}
            onChange={(e) => {
              setMaxFreezeDays(e.target.value);
              if (errors.maxFreezeDays)
                setErrors({ ...errors, maxFreezeDays: "" });
            }}
            placeholder="Boş bırakılabilir"
            min="0"
            className={errors.maxFreezeDays ? "border-destructive" : ""}
            disabled={isLoading}
          />
          {errors.maxFreezeDays && (
            <p className="text-sm text-destructive">{errors.maxFreezeDays}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Boş bırakılırsa dondurma izni verilmez
          </p>
        </div>

        {/* Sort Order */}
        <div className="space-y-2">
          <Label htmlFor="sortOrder">Sıralama</Label>
          <Input
            id="sortOrder"
            type="number"
            value={sortOrder}
            onChange={(e) => {
              setSortOrder(e.target.value);
              if (errors.sortOrder) setErrors({ ...errors, sortOrder: "" });
            }}
            placeholder="Boş bırakılabilir"
            className={errors.sortOrder ? "border-destructive" : ""}
            disabled={isLoading}
          />
          {errors.sortOrder && (
            <p className="text-sm text-destructive">{errors.sortOrder}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Düşük değerler önce görünür
          </p>
        </div>

        {/* Auto Renew */}
        <div className="space-y-2 md:col-span-2">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="autoRenew"
              checked={autoRenew}
              onCheckedChange={(checked) => {
                setAutoRenew(checked === true);
              }}
              disabled={isLoading}
            />
            <Label htmlFor="autoRenew" className="cursor-pointer">
              Otomatik Yenileme
            </Label>
          </div>
          <p className="text-xs text-muted-foreground">
            Üyelik bitiş tarihinde otomatik olarak yenilenecek
          </p>
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
