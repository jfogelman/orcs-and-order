# room at arrival, held-out (18 games, 6 a base)

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
| orc | 18 | 1 | **959** | **153** | 20 | 3.8 | 2 |
| human | 18 | 1 | **959** | **122** | 20 | 4.7 | 0 |
| wandering | 18 | 32 | **834** | **161** | 145 | 2.2 | 7 |
| unbound | 18 | 46 | **772** | **155** | 207 | 2.9 | 7 |
| hivekin | 18 | 39 | **811** | **177** | 168 | 3.6 | 1 |

## the same, split by whether the side survived

Mean / median in each cell. Small n everywhere; these are numbers, not tested differences.

| side | survived n | arrives | sites | near | founded | eliminated n | arrives | sites | near | founded |
|---|---|---|---|---|---|---|---|---|---|---|
| orc | 16 | 1 / 1 | 960 / 972 | 151 / 141 | 3.8 / 4.0 | 2 | 1 / 1 | 952 / 952 | 169 / 169 | 3.5 / 3.5 |
| human | 18 | 1 / 1 | 959 / 972 | 122 / 126 | 4.7 / 5.0 | 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0.0 / 0.0 |
| wandering | 11 | 25 / 22 | 858 / 882 | 164 / 174 | 3.1 / 3.0 | 7 | 43 / 39 | 795 / 784 | 155 / 142 | 0.9 / 1.0 |
| unbound | 11 | 40 / 38 | 782 / 777 | 165 / 171 | 3.9 / 4.0 | 7 | 54 / 58 | 756 / 751 | 140 / 157 | 1.4 / 1.0 |
| hivekin | 17 | 40 / 41 | 805 / 790 | 176 / 201 | 3.6 / 4.0 | 1 | 24 / 24 | 912 / 912 | 187 / 187 | 4.0 / 4.0 |

## every arrival, so the spread is visible

| side | turn | sites | near | founded | peak | end |
|---|---|---|---|---|---|---|
| hivekin | 14 | 916 | 134 | 3 | 5 | survived |
| hivekin | 15 | 866 | 215 | 4 | 6 | survived |
| hivekin | 18 | 914 | 182 | 4 | 6 | survived |
| hivekin | 19 | 905 | 217 | 3 | 8 | survived |
| hivekin | 20 | 947 | 206 | 4 | 7 | survived |
| hivekin | 24 | 912 | 187 | 4 | 6 | **gone** |
| hivekin | 24 | 851 | 228 | 3 | 5 | survived |
| hivekin | 34 | 790 | 84 | 4 | 5 | survived |
| hivekin | 40 | 843 | 305 | 4 | 5 | survived |
| hivekin | 41 | 791 | 203 | 4 | 6 | survived |
| hivekin | 45 | 733 | 147 | 4 | 6 | survived |
| hivekin | 54 | 761 | 76 | 2 | 8 | survived |
| hivekin | 55 | 776 | 83 | 4 | 5 | survived |
| hivekin | 56 | 726 | 201 | 2 | 6 | survived |
| hivekin | 57 | 713 | 202 | 5 | 6 | survived |
| hivekin | 58 | 701 | 106 | 4 | 6 | survived |
| hivekin | 60 | 704 | 163 | 4 | 6 | survived |
| hivekin | 63 | 753 | 244 | 3 | 5 | survived |
| unbound | 22 | 866 | 143 | 5 | 10 | survived |
| unbound | 35 | 843 | 275 | 4 | 7 | survived |
| unbound | 35 | 821 | 195 | 4 | 5 | **gone** |
| unbound | 36 | 731 | 44 | 3 | 6 | survived |
| unbound | 37 | 788 | 213 | 4 | 7 | survived |
| unbound | 38 | 841 | 218 | 4 | 6 | survived |
| unbound | 38 | 777 | 139 | 4 | 7 | survived |
| unbound | 40 | 775 | 62 | 2 | 6 | survived |
| unbound | 40 | 793 | 169 | 4 | 5 | survived |
| unbound | 43 | 852 | 163 | 1 | 1 | **gone** |
| unbound | 44 | 761 | 190 | 4 | 7 | survived |
| unbound | 55 | 725 | 188 | 5 | 7 | survived |
| unbound | 56 | 693 | 35 | 0 | 0 | **gone** |
| unbound | 58 | 671 | 108 | 1 | 1 | **gone** |
| unbound | 58 | 703 | 171 | 4 | 7 | survived |
| unbound | 59 | 751 | 238 | 2 | 2 | **gone** |
| unbound | 63 | 766 | 157 | 1 | 1 | **gone** |
| unbound | 64 | 738 | 82 | 1 | 1 | **gone** |
| wandering | 14 | 877 | 159 | 2 | 8 | survived |
| wandering | 15 | 921 | 199 | 2 | 8 | survived |
| wandering | 16 | 887 | 184 | 3 | 7 | survived |
| wandering | 16 | 918 | 179 | 3 | 9 | survived |
| wandering | 20 | 923 | 190 | 3 | 7 | survived |
| wandering | 22 | 832 | 210 | 4 | 7 | survived |
| wandering | 22 | 906 | 137 | 1 | 2 | **gone** |
| wandering | 24 | 908 | 161 | 4 | 7 | survived |
| wandering | 24 | 882 | 174 | 4 | 7 | survived |
| wandering | 25 | 886 | 215 | 1 | 2 | **gone** |
| wandering | 35 | 764 | 122 | 2 | 7 | survived |
| wandering | 37 | 789 | 115 | 4 | 7 | survived |
| wandering | 39 | 803 | 116 | 1 | 1 | **gone** |
| wandering | 39 | 778 | 171 | 1 | 1 | **gone** |
| wandering | 55 | 784 | 142 | 0 | 0 | **gone** |
| wandering | 56 | 738 | 116 | 3 | 11 | survived |
| wandering | 59 | 726 | 92 | 0 | 0 | **gone** |
| wandering | 59 | 681 | 210 | 2 | 5 | **gone** |

