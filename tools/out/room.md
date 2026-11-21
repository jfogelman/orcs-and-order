# room at arrival, tuned (18 games, 6 a base)

Measured at the first observation each side exists. `sites` is every tile
`canFoundCity` would allow -- land, not a terrain nothing grows on, and not
within 3 of a city -- which is the whole rule; borders and
ownership do not block founding. `near` is the same count within
8 tiles of one of that side's own units, which is the room it can
reach before somebody else takes it. `blocked` is land of legal terrain that
a neighbouring city rules out: the room that was there and has gone.

`founded` counts towns the side founded within 40 turns of arriving,
read as a rise in towns it founded itself, so a captured town is not a
founding. Nothing here is read by any rule and no dice are rolled.

## at arrival, by side

| side | n | arrives | sites | near | blocked | founded in window | eliminated |
|---|---|---|---|---|---|---|---|
| orc | 18 | 1 | **961** | **159** | 20 | 4.0 | 2 |
| human | 18 | 1 | **961** | **125** | 20 | 4.7 | 1 |
| unbound | 18 | 38 | **814** | **151** | 168 | 2.9 | 8 |
| wandering | 18 | 38 | **806** | **149** | 176 | 2.2 | 11 |
| hivekin | 18 | 45 | **784** | **154** | 197 | 3.3 | 3 |

## the same, split by whether the side survived

Mean / median in each cell. Small n everywhere; these are numbers, not tested differences.

| side | survived n | arrives | sites | near | founded | eliminated n | arrives | sites | near | founded |
|---|---|---|---|---|---|---|---|---|---|---|
| orc | 16 | 1 / 1 | 958 / 968 | 156 / 159 | 4.0 / 4.0 | 2 | 1 / 1 | 985 / 985 | 177 / 177 | 4.0 / 4.0 |
| human | 17 | 1 / 1 | 959 / 969 | 129 / 123 | 4.7 / 5.0 | 1 | 1 / 1 | 1008 / 1008 | 58 / 58 | 4.0 / 4.0 |
| unbound | 10 | 32 / 31 | 828 / 845 | 167 / 154 | 4.0 / 4.0 | 8 | 46 / 62 | 797 / 800 | 131 / 125 | 1.6 / 1.0 |
| wandering | 7 | 35 / 36 | 837 / 813 | 131 / 143 | 3.0 / 3.0 | 11 | 40 / 42 | 786 / 779 | 161 / 154 | 1.7 / 1.0 |
| hivekin | 15 | 45 / 45 | 782 / 774 | 151 / 156 | 3.5 / 4.0 | 3 | 45 / 54 | 796 / 828 | 168 / 192 | 2.7 / 2.0 |

## every arrival, so the spread is visible

| side | turn | sites | near | founded | peak | end |
|---|---|---|---|---|---|---|
| hivekin | 19 | 946 | 201 | 4 | 7 | survived |
| hivekin | 22 | 900 | 195 | 4 | 6 | survived |
| hivekin | 23 | 824 | 156 | 5 | 8 | survived |
| hivekin | 24 | 813 | 86 | 4 | 5 | survived |
| hivekin | 24 | 893 | 193 | 4 | 5 | **gone** |
| hivekin | 36 | 774 | 173 | 4 | 11 | survived |
| hivekin | 37 | 782 | 168 | 4 | 5 | survived |
| hivekin | 43 | 778 | 99 | 4 | 6 | survived |
| hivekin | 45 | 776 | 242 | 4 | 7 | survived |
| hivekin | 54 | 667 | 120 | 2 | 3 | **gone** |
| hivekin | 55 | 715 | 42 | 4 | 7 | survived |
| hivekin | 58 | 713 | 125 | 4 | 8 | survived |
| hivekin | 58 | 828 | 192 | 2 | 3 | **gone** |
| hivekin | 60 | 760 | 281 | 1 | 2 | survived |
| hivekin | 61 | 768 | 34 | 1 | 6 | survived |
| hivekin | 64 | 713 | 150 | 4 | 5 | survived |
| hivekin | 65 | 751 | 113 | 1 | 7 | survived |
| hivekin | 66 | 715 | 200 | 4 | 5 | survived |
| unbound | 14 | 930 | 246 | 5 | 9 | survived |
| unbound | 15 | 940 | 256 | 4 | 5 | **gone** |
| unbound | 15 | 921 | 203 | 4 | 7 | survived |
| unbound | 18 | 919 | 185 | 4 | 5 | **gone** |
| unbound | 19 | 841 | 209 | 1 | 2 | **gone** |
| unbound | 21 | 841 | 111 | 4 | 5 | survived |
| unbound | 26 | 848 | 112 | 3 | 8 | survived |
| unbound | 26 | 863 | 294 | 4 | 6 | survived |
| unbound | 35 | 717 | 172 | 4 | 12 | survived |
| unbound | 39 | 804 | 53 | 4 | 7 | survived |
| unbound | 41 | 876 | 136 | 4 | 6 | survived |
| unbound | 46 | 746 | 136 | 5 | 13 | survived |
| unbound | 58 | 731 | 207 | 3 | 7 | survived |
| unbound | 61 | 722 | 39 | 1 | 1 | **gone** |
| unbound | 63 | 658 | 59 | 1 | 1 | **gone** |
| unbound | 63 | 826 | 128 | 1 | 1 | **gone** |
| unbound | 64 | 695 | 48 | 0 | 0 | **gone** |
| unbound | 64 | 774 | 122 | 1 | 1 | **gone** |
| wandering | 14 | 836 | 179 | 3 | 7 | **gone** |
| wandering | 16 | 931 | 254 | 5 | 6 | **gone** |
| wandering | 19 | 923 | 192 | 2 | 7 | survived |
| wandering | 22 | 934 | 186 | 3 | 9 | survived |
| wandering | 24 | 936 | 126 | 3 | 9 | survived |
| wandering | 36 | 802 | 147 | 4 | 8 | survived |
| wandering | 37 | 833 | 120 | 1 | 1 | **gone** |
| wandering | 38 | 813 | 61 | 4 | 7 | survived |
| wandering | 40 | 816 | 154 | 0 | 0 | **gone** |
| wandering | 42 | 759 | 174 | 3 | 4 | **gone** |
| wandering | 42 | 760 | 65 | 3 | 7 | survived |
| wandering | 42 | 834 | 263 | 1 | 2 | **gone** |
| wandering | 44 | 685 | 91 | 1 | 1 | **gone** |
| wandering | 45 | 779 | 260 | 4 | 5 | **gone** |
| wandering | 46 | 732 | 49 | 0 | 0 | **gone** |
| wandering | 57 | 703 | 121 | 1 | 1 | **gone** |
| wandering | 61 | 733 | 102 | 0 | 0 | **gone** |
| wandering | 66 | 693 | 143 | 2 | 14 | survived |

