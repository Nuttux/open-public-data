"""
Module de logging pour les scripts d'export Paris Budget Dashboard.

Fournit un logging coloré et structuré avec:
- Timestamps
- Niveaux (INFO, SUCCESS, WARNING, ERROR)
- Progress bars pour les opérations longues
- Résumé final

Usage:
    from utils.logger import Logger
    
    log = Logger("export_sankey")
    log.info("Démarrage export")
    log.success("Fichier créé", extra="budget_2024.json")
    log.warning("Table manquante", extra="int_top_beneficiaires")
    log.error("Échec connexion BigQuery")
"""

import sys
import time
from datetime import datetime
from typing import Optional

# Couleurs ANSI
class Colors:
    RESET = "\033[0m"
    BOLD = "\033[1m"
    DIM = "\033[2m"
    
    # Couleurs
    RED = "\033[91m"
    GREEN = "\033[92m"
    YELLOW = "\033[93m"
    BLUE = "\033[94m"
    PURPLE = "\033[95m"
    CYAN = "\033[96m"
    WHITE = "\033[97m"
    GRAY = "\033[90m"


class Logger:
    """Logger structuré avec couleurs et timestamps."""
    
    def __init__(self, name: str, verbose: bool = True):
        self.name = name
        self.verbose = verbose
        self.start_time = time.time()
        self.counts = {"info": 0, "success": 0, "warning": 0, "error": 0}
    
    def _timestamp(self) -> str:
        """Retourne le timestamp formaté."""
        return datetime.now().strftime("%H:%M:%S")
    
    def _elapsed(self) -> str:
        """Retourne le temps écoulé."""
        elapsed = time.time() - self.start_time
        if elapsed < 60:
            return f"{elapsed:.1f}s"
        elif elapsed < 3600:
            return f"{elapsed/60:.1f}min"
        else:
            return f"{elapsed/3600:.1f}h"
    
    def _print(self, level: str, icon: str, color: str, message: str, extra: Optional[str] = None):
        """Affiche un message formaté."""
        timestamp = f"{Colors.GRAY}[{self._timestamp()}]{Colors.RESET}"
        level_str = f"{color}{icon}{Colors.RESET}"
        
        line = f"{timestamp} {level_str} {message}"
        if extra:
            line += f" {Colors.DIM}({extra}){Colors.RESET}"
        
        print(line)
        sys.stdout.flush()
    
    def header(self, title: str):
        """Affiche un header de section."""
        width = 60
        print()
        print(f"{Colors.CYAN}{'=' * width}{Colors.RESET}")
        print(f"{Colors.CYAN}{Colors.BOLD}{title.center(width)}{Colors.RESET}")
        print(f"{Colors.CYAN}{'=' * width}{Colors.RESET}")
        print()
    
    def section(self, title: str):
        """Affiche un titre de sous-section."""
        print()
        print(f"{Colors.BLUE}{Colors.BOLD}▶ {title}{Colors.RESET}")
    
    def info(self, message: str, extra: Optional[str] = None):
        """Log niveau INFO."""
        self.counts["info"] += 1
        self._print("INFO", "ℹ️ ", Colors.BLUE, message, extra)
    
    def success(self, message: str, extra: Optional[str] = None):
        """Log niveau SUCCESS."""
        self.counts["success"] += 1
        self._print("SUCCESS", "✅", Colors.GREEN, message, extra)
    
    def warning(self, message: str, extra: Optional[str] = None):
        """Log niveau WARNING."""
        self.counts["warning"] += 1
        self._print("WARNING", "⚠️ ", Colors.YELLOW, message, extra)
    
    def error(self, message: str, extra: Optional[str] = None):
        """Log niveau ERROR."""
        self.counts["error"] += 1
        self._print("ERROR", "❌", Colors.RED, message, extra)
    
    def data(self, label: str, value, unit: str = ""):
        """Affiche une donnée formatée."""
        if isinstance(value, float):
            if value >= 1_000_000_000:
                formatted = f"{value/1_000_000_000:.2f} Md€"
            elif value >= 1_000_000:
                formatted = f"{value/1_000_000:.1f} M€"
            elif value >= 1_000:
                formatted = f"{value/1_000:.1f} k€"
            else:
                formatted = f"{value:.0f} €"
        elif isinstance(value, int):
            formatted = f"{value:,}".replace(",", " ")
            if unit:
                formatted += f" {unit}"
        else:
            formatted = str(value)
        
        print(f"   {Colors.DIM}•{Colors.RESET} {label}: {Colors.WHITE}{formatted}{Colors.RESET}")
    
    def progress(self, current: int, total: int, item: str = ""):
        """Affiche une barre de progression."""
        pct = (current / total) * 100 if total > 0 else 0
        bar_width = 30
        filled = int(bar_width * current / total) if total > 0 else 0
        bar = "█" * filled + "░" * (bar_width - filled)
        
        item_str = f" {item}" if item else ""
        line = f"\r   {Colors.PURPLE}[{bar}]{Colors.RESET} {pct:5.1f}% ({current}/{total}){item_str}"
        
        print(line, end="")
        if current >= total:
            print()  # New line at 100%
        sys.stdout.flush()
    
    def summary(self):
        """Affiche le résumé final."""
        print()
        print(f"{Colors.CYAN}{'─' * 60}{Colors.RESET}")
        elapsed = self._elapsed()
        
        status_parts = []
        if self.counts["success"] > 0:
            status_parts.append(f"{Colors.GREEN}✅ {self.counts['success']} succès{Colors.RESET}")
        if self.counts["warning"] > 0:
            status_parts.append(f"{Colors.YELLOW}⚠️  {self.counts['warning']} warnings{Colors.RESET}")
        if self.counts["error"] > 0:
            status_parts.append(f"{Colors.RED}❌ {self.counts['error']} erreurs{Colors.RESET}")
        
        status = " | ".join(status_parts) if status_parts else "Aucune opération"
        
        print(f"{Colors.BOLD}Terminé en {elapsed}{Colors.RESET} — {status}")
        print(f"{Colors.CYAN}{'─' * 60}{Colors.RESET}")
        print()


def format_euros(value: float) -> str:
    """Formate un montant en euros lisible."""
    if value >= 1_000_000_000:
        return f"{value/1_000_000_000:.2f} Md€"
    elif value >= 1_000_000:
        return f"{value/1_000_000:.1f} M€"
    elif value >= 1_000:
        return f"{value/1_000:.1f} k€"
    else:
        return f"{value:.0f} €"


def format_number(value: int) -> str:
    """Formate un nombre avec séparateurs."""
    return f"{value:,}".replace(",", " ")
