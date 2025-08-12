import React, { useState, useRef, useEffect } from 'react';
import { FaCaretDown } from 'react-icons/fa';

type DropdownOption = string | { label: string; value: string };

interface KGDropdownProps {
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  label: string;
  className?: string;
  buttonClassName?: string;
  optionClassName?: string;
  showValueAsLabel?: boolean;
  hideButton?: boolean;
  isOpen?: boolean;
  onToggle?: (open: boolean) => void;
}

const KGDropdown: React.FC<KGDropdownProps> = ({
  options,
  value,
  onChange,
  label,
  className = '',
  buttonClassName = '',
  optionClassName = '',
  showValueAsLabel = false,
  hideButton = false,
  isOpen: externalIsOpen,
  onToggle
}) => {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  // Use external state if provided, otherwise use internal state
  const isOpen = externalIsOpen !== undefined ? externalIsOpen : internalIsOpen;
  const setIsOpen = onToggle || setInternalIsOpen;

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        isOpen && 
        dropdownRef.current && 
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Handle option selection
  const handleSelect = (option: DropdownOption) => {
    const value = typeof option === 'string' ? option : option.value;
    onChange(value);
    setIsOpen(false);
  };

  const resolveLabel = (option: DropdownOption) => (typeof option === 'string' ? option : option.label);
  const resolveValue = (option: DropdownOption) => (typeof option === 'string' ? option : option.value);

  const selectedLabel = (() => {
    if (!showValueAsLabel) return label;
    // Try to find the label for the current value
    const match = options.find(opt => resolveValue(opt) === value);
    return match ? resolveLabel(match) : value;
  })();

  const buttonText = showValueAsLabel ? selectedLabel : label;

  return (
    <div className={`quant-dropdown-container ${className}`} ref={dropdownRef}>
      {!hideButton && (
        <button 
          className={`quant-button ${buttonClassName}`}
          onClick={() => setIsOpen(!isOpen)}
        >
          {buttonText} <FaCaretDown />
        </button>
      )}
          {isOpen && (
        <div className="quant-dropdown">
          {options.map((option) => {
            const optionValue = resolveValue(option);
            return (
              <div 
                key={optionValue} 
                className={`quant-option ${value === optionValue ? 'active' : ''} ${optionClassName}`}
                onClick={() => handleSelect(option)}
              >
                {resolveLabel(option)}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default KGDropdown; 