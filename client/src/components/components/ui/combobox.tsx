import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

export interface ComboboxOption {
  value: string
  label: string
  searchTerms?: string // Termos adicionais para busca (ex: código + descrição)
}

interface ComboboxProps {
  options: ComboboxOption[]
  value?: string
  onValueChange: (value: string) => void
  placeholder?: string
  emptyText?: string
  searchPlaceholder?: string
  disabled?: boolean
  className?: string
}

export function Combobox({
  options,
  value,
  onValueChange,
  placeholder = "Selecione...",
  emptyText = "Nenhum resultado encontrado",
  searchPlaceholder = "Buscar...",
  disabled = false,
  className,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")

  const selectedOption = options.find((option) => option.value === value)

  // Filtragem manual por substring exato (case-insensitive)
  const filteredOptions = React.useMemo(() => {
    if (!search) return options;
    const searchLower = search.toLowerCase();
    return options.filter((option) => {
      const searchText = (option.searchTerms || option.label).toLowerCase();
      return searchText.includes(searchLower);
    });
  }, [options, search]);

  // Mapa de lowercase → valor original para lidar com normalização do cmdk
  const valueMap = React.useMemo(() => {
    const map: Record<string, string> = {};
    options.forEach((option) => {
      map[option.value.toLowerCase()] = option.value;
    });
    return map;
  }, [options]);

  return (
    <Popover open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen);
      if (!isOpen) setSearch(""); // Limpar busca ao fechar
    }}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between", className)}
          disabled={disabled}
        >
          <span className="truncate">
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={searchPlaceholder}
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {filteredOptions.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  onSelect={(selectedValue) => {
                    // cmdk normaliza o value para lowercase — recuperar o original
                    const originalValue = valueMap[selectedValue.toLowerCase()] ?? selectedValue;
                    onValueChange(originalValue === value ? "" : originalValue);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === option.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
