import requests
import urllib3

urllib3.disable_warnings()

SITE_URL = "https://iberdrola.sharepoint.com/sites/CompartilhamentodePostes"

LISTA = "CONTROLE_DIARIO_DE_TECNICO_DE_FISCALIZACOES"

URL = (
    f"{SITE_URL}/_api/web/lists/GetByTitle('{LISTA}')/items"
)

headers = {
    "Accept": "application/json;odata=verbose"
}

proxies = {
    "http": "http://proxyzsneoclb.neoenergia.net:80",
    "https": "http://proxyzsneoclb.neoenergia.net:80"
}

try:

    response = requests.get(
        URL,
        headers=headers,
        proxies=proxies,
        verify=False,
        timeout=60
    )

    print("STATUS:", response.status_code)
    print(response.text[:1000])

except Exception as e:
    print("ERRO:")
    print(e)