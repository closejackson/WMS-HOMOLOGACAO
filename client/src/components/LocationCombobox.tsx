import { Combobox, ComboboxOption } from "@/components/ui/combobox";

interface Location {
  id: number;
  code: string;
  zoneName?: string;
}

interface LocationComboboxProps {
  locations: Location[] | undefined;
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function LocationCombobox({
  locations,
  value,
  onValueChange,
  placeholder = "Selecione um endereço",
  disabled = false,
  className,
}: LocationComboboxProps) {
  const options: ComboboxOption[] = (locations || []).map((location) => ({
    value: location.id.toString(),
    label: location.zoneName 
      ? `${location.code} (${location.zoneName})`
      : location.code,
    searchTerms: `${location.code} ${location.zoneName || ""}`.toLowerCase(),
  }));

  return (
    <Combobox
      options={options}
      value={value}
      onValueChange={onValueChange}
      placeholder={placeholder}
      emptyText="Nenhum endereço encontrado"
      searchPlaceholder="Buscar por código ou zona..."
      disabled={disabled}
      className={className}
    />
  );
}
