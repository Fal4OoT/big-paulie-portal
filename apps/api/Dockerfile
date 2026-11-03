FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY src/BigPaulie.Api/BigPaulie.Api.csproj src/BigPaulie.Api/
RUN dotnet restore src/BigPaulie.Api/BigPaulie.Api.csproj
COPY src/ src/
RUN dotnet publish src/BigPaulie.Api/BigPaulie.Api.csproj -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:8.0
# tzdata pour le fuseau Europe/Paris (tournées à heure fixe)
RUN apt-get update && apt-get install -y --no-install-recommends tzdata curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app .
RUN mkdir -p /keys && chown app:app /keys
USER app
ENV ASPNETCORE_ENVIRONMENT=Production
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s CMD curl -fs http://localhost:8080/api/health || exit 1
ENTRYPOINT ["dotnet", "BigPaulie.Api.dll"]
