import { describe, it, expect } from '../test/vitestCompat';
import { calculateDynamicDeviationThreshold } from './laylineCalculator';

/**
 * Unit Tests for Dynamic Deviation Thresholds
 * Validates that sailing precision requirements scale correctly by point of sail
 */

describe('calculateDynamicDeviationThreshold', () => {
  
  // Close-hauled (Ceñida) tests: 0-30° and 330-360°
  describe('Close-hauled (Ceñida) - 8° threshold', () => {
    it('should return 8° for TWA 0° (direct upwind)', () => {
      expect(calculateDynamicDeviationThreshold(0)).toBe(8);
    });

    it('should return 8° for TWA 15° (ceñida)', () => {
      expect(calculateDynamicDeviationThreshold(15)).toBe(8);
    });

    it('should return 8° for TWA 29° (at threshold boundary)', () => {
      expect(calculateDynamicDeviationThreshold(29)).toBe(8);
    });

    it('should return 8° for TWA 330° (approaching upwind from other tack)', () => {
      expect(calculateDynamicDeviationThreshold(330)).toBe(8);
    });

    it('should return 8° for TWA 345° (nearly upwind)', () => {
      expect(calculateDynamicDeviationThreshold(345)).toBe(8);
    });

    it('should return 8° for TWA 360° (full circle)', () => {
      expect(calculateDynamicDeviationThreshold(360)).toBe(8);
    });
  });

  // Close reach tests: 30-60° and 300-330°
  describe('Close reach - 10° threshold', () => {
    it('should return 10° for TWA 30°', () => {
      expect(calculateDynamicDeviationThreshold(30)).toBe(10);
    });

    it('should return 10° for TWA 45°', () => {
      expect(calculateDynamicDeviationThreshold(45)).toBe(10);
    });

    it('should return 10° for TWA 59° (at upper boundary)', () => {
      expect(calculateDynamicDeviationThreshold(59)).toBe(10);
    });

    it('should return 10° for TWA 300°', () => {
      expect(calculateDynamicDeviationThreshold(300)).toBe(10);
    });

    it('should return 10° for TWA 315°', () => {
      expect(calculateDynamicDeviationThreshold(315)).toBe(10);
    });
  });

  // Beam reach & Broad reach tests: 60-120° and 240-300°
  describe('Beam reach & Broad reach (Través) - 15° threshold', () => {
    it('should return 15° for TWA 60°', () => {
      expect(calculateDynamicDeviationThreshold(60)).toBe(15);
    });

    it('should return 15° for TWA 90° (pure beam reach)', () => {
      expect(calculateDynamicDeviationThreshold(90)).toBe(15);
    });

    it('should return 15° for TWA 119° (at upper boundary)', () => {
      expect(calculateDynamicDeviationThreshold(119)).toBe(15);
    });

    it('should return 15° for TWA 240°', () => {
      expect(calculateDynamicDeviationThreshold(240)).toBe(15);
    });

    it('should return 15° for TWA 270° (pure beam reach opposite)', () => {
      expect(calculateDynamicDeviationThreshold(270)).toBe(15);
    });

    it('should return 15° for TWA 299° (at upper boundary)', () => {
      expect(calculateDynamicDeviationThreshold(299)).toBe(15);
    });
  });

  // Running (Empopada) tests: 120-240°
  describe('Running (Empopada) - 18° threshold', () => {
    it('should return 18° for TWA 120°', () => {
      expect(calculateDynamicDeviationThreshold(120)).toBe(18);
    });

    it('should return 18° for TWA 180° (pure downwind)', () => {
      expect(calculateDynamicDeviationThreshold(180)).toBe(18);
    });

    it('should return 18° for TWA 239° (at upper boundary)', () => {
      expect(calculateDynamicDeviationThreshold(239)).toBe(18);
    });
  });

  // Boundary condition tests
  describe('Boundary conditions', () => {
    it('should transition from ceñida to close reach at 30°', () => {
      expect(calculateDynamicDeviationThreshold(29.9)).toBe(8);
      expect(calculateDynamicDeviationThreshold(30)).toBe(10);
    });

    it('should transition from close reach to beam reach at 60°', () => {
      expect(calculateDynamicDeviationThreshold(59.9)).toBe(10);
      expect(calculateDynamicDeviationThreshold(60)).toBe(15);
    });

    it('should transition from beam reach to running at 120°', () => {
      expect(calculateDynamicDeviationThreshold(119.9)).toBe(15);
      expect(calculateDynamicDeviationThreshold(120)).toBe(18);
    });

    it('should transition from running to beam reach at 240°', () => {
      expect(calculateDynamicDeviationThreshold(239.9)).toBe(18);
      expect(calculateDynamicDeviationThreshold(240)).toBe(15);
    });
  });

  // Negative and large angle normalization tests
  describe('Angle normalization', () => {
    it('should normalize negative angles correctly', () => {
      // -30 should normalize to 330
      expect(calculateDynamicDeviationThreshold(-30)).toBe(8);
    });

    it('should normalize angles > 360 correctly', () => {
      // 390 should normalize to 30
      expect(calculateDynamicDeviationThreshold(390)).toBe(10);
    });

    it('should normalize 720° (two full rotations) to 0°', () => {
      expect(calculateDynamicDeviationThreshold(720)).toBe(8);
    });

    it('should handle large negative angles', () => {
      // -90 should normalize to 270 (beam reach)
      expect(calculateDynamicDeviationThreshold(-90)).toBe(15);
    });
  });

  // Tactical precision validation
  describe('Tactical precision validation', () => {
    it('should enforce stricter precision in ceñida than in running', () => {
      const cenadaThreshold = calculateDynamicDeviationThreshold(15);
      const empopadaThreshold = calculateDynamicDeviationThreshold(180);
      expect(cenadaThreshold).toBeLessThan(empopadaThreshold);
      expect(cenadaThreshold).toBe(8);
      expect(empopadaThreshold).toBe(18);
    });

    it('should show graduated precision requirements across all points of sail', () => {
      const thresholds = {
        cenada: calculateDynamicDeviationThreshold(15),
        closeReach: calculateDynamicDeviationThreshold(45),
        beam: calculateDynamicDeviationThreshold(90),
        broad: calculateDynamicDeviationThreshold(135),
        empopada: calculateDynamicDeviationThreshold(180),
      };

      // Verify hierarchy: ceñida < close reach < beam/broad ≈ running
      expect(thresholds.cenada).toBe(8);
      expect(thresholds.closeReach).toBe(10);
      expect(thresholds.beam).toBe(15);
      expect(thresholds.broad).toBe(18);
      expect(thresholds.empopada).toBe(18);
    });
  });
});
