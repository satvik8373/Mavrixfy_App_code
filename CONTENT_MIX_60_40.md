# Content Mix: 60% YouTube Music / 40% JioSaavn

## Overview
The home screen now displays content with a 60/40 distribution favoring YouTube Music, while maintaining quality sections and proper content variety.

## Content Distribution

### Pattern: 3:2 Ratio (60% YouTube / 40% JioSaavn)

```
Every 5 items:
┌─────────────────────────────────┐
│ 1. YouTube Playlist             │ ← 60%
│ 2. YouTube Playlist             │ ← YouTube
│ 3. JioSaavn Playlist            │ ← 40%
│ 4. YouTube Playlist             │ ← JioSaavn
│ 5. JioSaavn Playlist            │
└─────────────────────────────────┘
Pattern repeats...
```

### Full Section Example
```
Section: "Trending Now" (12 items)
┌─────────────────────────────────┐
│ 1. YouTube Playlist A           │ YT
│ 2. YouTube Playlist B           │ YT
│ 3. JioSaavn Playlist A          │ Jio
│ 4. YouTube Playlist C           │ YT
│ 5. JioSaavn Playlist B          │ Jio
│ 6. YouTube Playlist D           │ YT  ← Pattern repeats
│ 7. YouTube Playlist E           │ YT
│ 8. JioSaavn Playlist C          │ Jio
│ 9. YouTube Playlist F           │ YT
│ 10. JioSaavn Playlist D         │ Jio
│ 11. YouTube Playlist G          │ YT
│ 12. YouTube Playlist H          │ YT
└─────────────────────────────────┘

Result: 8 YouTube (66%) / 4 JioSaavn (33%)
Actual distribution fluctuates 60-65% YouTube
```

## Algorithm Details

### Interleave Function
```typescript
function interleaveHomeCategoryItems(
  jioItems: HomeCategoryItem[],
  youtubeItems: HomeCategoryItem[],
  limit: number
): HomeCategoryItem[] {
  const merged: HomeCategoryItem[] = [];
  const seen = new Set<string>();

  // Pattern: YT, YT, Jio, YT, Jio (repeats)
  while (merged.length < limit && (youtubeIndex < youtubeItems.length || jioIndex < jioItems.length)) {
    append(youtubeItems[youtubeIndex++]); // 1st: YouTube
    append(youtubeItems[youtubeIndex++]); // 2nd: YouTube
    append(jioItems[jioIndex++]);         // 3rd: JioSaavn
    append(youtubeItems[youtubeIndex++]); // 4th: YouTube
    append(jioItems[jioIndex++]);         // 5th: JioSaavn
  }
  
  // Fill remaining with whatever is available
  if (merged.length < limit) {
    [...youtubeItems.slice(youtubeIndex), ...jioItems.slice(jioIndex)].forEach(append);
  }

  return merged;
}
```

### YouTube Fetch Optimization
```typescript
// Fetch 50% more YouTube items to ensure sufficient content
const youtubeLimit = Math.max(10, Math.ceil(options.limitPerCategory * 1.5));

// Example:
// If limitPerCategory = 12
// youtubeLimit = Math.ceil(12 * 1.5) = 18
// This ensures we have enough YouTube content for the 60% target
```

## Content Balance Comparison

### Historical Progression

| Version | YouTube % | JioSaavn % | Pattern |
|---------|-----------|------------|---------|
| Original | 66% | 33% | YT, YT, Jio |
| Updated (v1) | 50% | 50% | YT, Jio |
| **Current (v2)** | **60%** | **40%** | **YT, YT, Jio, YT, Jio** |

### Why 60/40?

1. **YouTube Music Focus**
   - YouTube Music is the primary content source
   - Larger library and better metadata
   - More user engagement

2. **JioSaavn Balance**
   - Still meaningful representation (40%)
   - Provides regional content diversity
   - Maintains user choice

3. **User Experience**
   - Not too dominant (like 66%)
   - Not completely balanced (50% felt equal)
   - Sweet spot for content discovery

## Visual Breakdown

### 12-Item Section Distribution
```
Position  1  2  3  4  5  6  7  8  9 10 11 12
        ┌──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┐
Source  │YT│YT│Jio│YT│Jio│YT│YT│Jio│YT│Jio│YT│YT│
        └──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┘
         ▲─▲─▲───▲─▲───▲─▲─▲───▲─▲───▲─▲
         |  |  |   |  |   |  |  |   |  |   └─ Pattern
         |  |  |   |  |   |  |  |   |  |
         3:2 ratio repeating every 5 items
         
YouTube Count: 7-8 items (58-66%)
JioSaavn Count: 4-5 items (33-42%)
Average: 60% YouTube / 40% JioSaavn
```

## Section Examples

### Trending Now
```
┌────────────────────────────────────┐
│ Trending Now                   →   │
│ ┌────┐┌────┐┌────┐┌────┐┌────┐   │
│ │YT 1││YT 2││Jio1││YT 3││Jio2│   │
│ └────┘└────┘└────┘└────┘└────┘   │
│ ┌────┐┌────┐┌────┐┌────┐┌────┐   │
│ │YT 4││YT 5││Jio3││YT 6││Jio4│   │
│ └────┘└────┘└────┘└────┘└────┘   │
│ ┌────┐┌────┐                      │
│ │YT 7││YT 8│                      │
│ └────┘└────┘                      │
└────────────────────────────────────┘
Result: 8 YT / 4 Jio = 67% YouTube
```

### Top Charts
```
┌────────────────────────────────────┐
│ Top Charts                     →   │
│ ┌────┐┌────┐┌────┐┌────┐┌────┐   │
│ │YT 1││YT 2││Jio1││YT 3││Jio2│   │
│ └────┘└────┘└────┘└────┘└────┘   │
│ ┌────┐┌────┐┌────┐┌────┐┌────┐   │
│ │YT 4││YT 5││Jio3││YT 6││Jio4│   │
│ └────┘└────┘└────┘└────┘└────┘   │
└────────────────────────────────────┘
Result: 6 YT / 4 Jio = 60% YouTube
```

### New Releases
```
┌────────────────────────────────────┐
│ New Releases                   →   │
│ ┌────┐┌────┐┌────┐┌────┐┌────┐   │
│ │YT 1││YT 2││Jio1││YT 3││Jio2│   │
│ └────┘└────┘└────┘└────┘└────┘   │
│ ┌────┐┌────┐┌────┐┌────┐┌────┐   │
│ │YT 4││YT 5││Jio3││YT 6││Jio4│   │
│ └────┘└────┘└────┘└────┘└────┘   │
│ ┌────┐┌────┐                      │
│ │YT 7││Jio5│                      │
│ └────┘└────┘                      │
└────────────────────────────────────┘
Result: 7 YT / 5 Jio = 58% YouTube
```

## Quality Controls

### Minimum Items Per Section
```typescript
const MIN_ROW_ITEMS = 3;

// Ensures no section appears with only 1-2 items
// Maintains visual consistency
```

### Maximum Items Per Section
```typescript
const MAX_ROW_ITEMS = 12;

// Prevents overly long sections
// Keeps content digestible
```

### Fetch Optimization
```typescript
// YouTube gets 50% more fetch quota
const youtubeLimit = Math.max(10, Math.ceil(limitPerCategory * 1.5));

// Ensures sufficient YouTube content
// Accounts for potential duplicates/filtering
```

## User Benefits

### Content Discovery
✅ **More YouTube Music** - Primary content source well-represented  
✅ **JioSaavn Variety** - Still meaningful presence (40%)  
✅ **Balanced Discovery** - Not overwhelmingly one-sided

### Visual Experience
✅ **Clear Pattern** - Users see consistent distribution  
✅ **Quality Sections** - Minimum 3 items each  
✅ **Rich Content** - Up to 12 items per section

### Performance
✅ **Optimized Fetch** - Smart YouTube quota allocation  
✅ **Efficient Caching** - Both sources cached properly  
✅ **Fast Loading** - Parallel fetch maintained

## Testing Verification

### How to Verify 60/40 Mix

1. **Open Home Screen**
2. **Check "Trending Now" section**
3. **Count first 10 items:**
   - Expected: 6 YouTube, 4 JioSaavn
   - Pattern: YT, YT, Jio, YT, Jio, YT, YT, Jio, YT, Jio

4. **Check "Top Charts" section**
   - Should follow same pattern
   - Look for brand badges (Mavrixfy icon indicates source)

5. **Verify across all category sections**
   - All should show 60/40 distribution
   - Minimum 3 items per section

### Expected Results
- ✅ YouTube content: 60-65% of playlists
- ✅ JioSaavn content: 35-40% of playlists
- ✅ Consistent pattern across sections
- ✅ No sections with <3 items
- ✅ Smooth scrolling and loading

## Summary

### Configuration
```typescript
// Content Distribution
Pattern: YT, YT, Jio, YT, Jio (3:2 ratio)
Target: 60% YouTube Music / 40% JioSaavn
Fetch: YouTube gets 1.5x quota

// Quality Controls
MIN_ROW_ITEMS = 3
MAX_ROW_ITEMS = 12
HOME_MAX_DEFAULT_BROWSE_SECTIONS = 9
```

### Key Features
- ✅ **60/40 content mix** favoring YouTube Music
- ✅ **Consistent pattern** across all sections
- ✅ **Quality sections** with minimum 3 items
- ✅ **Optimized fetching** for YouTube content
- ✅ **Better user experience** with balanced variety

### Impact
- **YouTube Music**: Primary content source, well-represented
- **JioSaavn**: Secondary source, still meaningful presence
- **User Experience**: Clear pattern, quality sections, diverse content
- **Performance**: Optimized fetching, efficient caching
