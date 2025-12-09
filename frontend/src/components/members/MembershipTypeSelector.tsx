import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface MembershipTypeSelectorProps {
  value?: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
}

/**
 * Predefined membership types
 */
const MEMBERSHIP_TYPES = [
  { value: 'Basic', label: 'Basic' },
  { value: 'Standard', label: 'Standard' },
  { value: 'Premium', label: 'Premium' },
  { value: 'Custom', label: 'Özel' },
] as const;

/**
 * Component for selecting membership type
 * Supports Basic, Standard, Premium, and Custom options
 */
export function MembershipTypeSelector({
  value,
  onValueChange,
  disabled,
}: MembershipTypeSelectorProps) {
  return (
    <Select value={value || ''} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger>
        <SelectValue placeholder="Üyelik tipi seçin" />
      </SelectTrigger>
      <SelectContent>
        {MEMBERSHIP_TYPES.map((type) => (
          <SelectItem key={type.value} value={type.value}>
            {type.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

