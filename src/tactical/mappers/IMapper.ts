export interface IMapper<TSource, TDestination> {

    map(source: TSource): TDestination;

}