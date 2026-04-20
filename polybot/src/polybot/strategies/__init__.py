from .base import Signal, Strategy
from .mispricing import MispricingStrategy

REGISTRY: dict[str, type[Strategy]] = {
    "mispricing": MispricingStrategy,
}

__all__ = ["Signal", "Strategy", "REGISTRY"]
