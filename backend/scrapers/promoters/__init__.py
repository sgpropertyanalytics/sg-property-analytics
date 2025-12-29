"""Promoters - Project canonical entities to domain tables."""

from .base import BasePromoter
from .gls_tender_promoter import GLSTenderPromoter

__all__ = ["BasePromoter", "GLSTenderPromoter"]
